import type { EngineUrls, SearchOptions, SearchResult } from './types';
import { assembleSearch, type SearchResultShape } from './uci';

/**
 * Pikafish WASM 封装。一次只允许一个 search 在跑（UCI 是串行协议）。
 * 内部通过 Web Worker 驱动，主线程不被阻塞。
 */
export class PikafishEngine {
  private worker!: Worker;
  private ready = false;
  private lines: string[] = [];
  private pending: {
    resolve: (r: SearchResultShape[]) => void;
    reject: (e: Error) => void;
  } | null = null;
  private tokenWaiters = new Map<string, () => void>();
  onProgress?: (loaded: number, total: number) => void;
  onLine?: (line: string) => void;
  onStderr?: (line: string) => void;

  constructor(private urls: EngineUrls) {}

  async init(threads = 4): Promise<void> {
    this.worker = new Worker(this.urls.workerUrl);

    const readyPromise = new Promise<void>((resolve, reject) => {
      const onMessage = (ev: MessageEvent) => {
        const d = ev.data;
        if (d.type === 'ready') {
          this.worker.removeEventListener('message', onMessage);
          resolve();
        } else if (d.type === 'error') {
          this.worker.removeEventListener('message', onMessage);
          reject(new Error(d.error));
        } else if (d.type === 'net-progress') {
          this.onProgress?.(d.loaded, d.total);
        }
      };
      this.worker.addEventListener('message', onMessage);
    });

    this.worker.onmessage = (ev: MessageEvent) => this.handle(ev.data);
    this.worker.postMessage({
      type: 'init',
      jsUrl: this.urls.jsUrl,
      wasmUrl: this.urls.wasmUrl,
      netUrl: this.urls.netUrl,
    });

    await readyPromise;

    this.send('uci');
    await this.waitFor('uciok');
    this.send(`setoption name Threads value ${threads}`);
    this.send('isready');
    await this.waitFor('readyok');
    this.ready = true;
  }

  private waitFor(token: string): Promise<void> {
    return new Promise((resolve) => {
      this.tokenWaiters.set(token, resolve);
    });
  }

  private send(cmd: string): void {
    this.worker.postMessage({ type: 'command', command: cmd });
  }

  private handle(data: { type: string; line?: string; error?: string }): void {
    if (data.type === 'stderr' && data.line) {
      this.onStderr?.(data.line);
      return;
    }
    if (data.type === 'error' && this.pending) {
      const p = this.pending;
      this.pending = null;
      p.reject(new Error(data.error ?? 'engine error'));
      return;
    }
    if (data.type !== 'line' || !data.line) return;

    const line = data.line;
    this.onLine?.(line);

    // 简单的握手令牌（uciok / readyok），只在等待时匹配一次
    for (const [token, resolve] of this.tokenWaiters) {
      if (line.includes(token)) {
        this.tokenWaiters.delete(token);
        resolve();
      }
    }

    if (this.pending) {
      this.lines.push(line);
      if (line.startsWith('bestmove')) {
        const results = assembleSearch(this.lines);
        const p = this.pending;
        this.pending = null;
        this.lines = [];
        p.resolve(results);
      }
    }
  }

  /** 评估给定 FEN 局面，返回行棋方视角的最佳着法与评分。 */
  async search(fen: string, opts: SearchOptions = {}): Promise<SearchResult> {
    const results = await this.searchMultiPv(fen, 1, opts);
    return results[0];
  }

  /** MultiPV：返回多条候选着法，按评分降序。 */
  async searchMultiPv(fen: string, multiPv = 1, opts: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.ready) throw new Error('engine not initialized');
    if (this.pending) throw new Error('engine busy: a search is already running');

    this.send(`setoption name MultiPV value ${multiPv}`);
    this.send(`position fen ${fen}`);

    const go = ['go'];
    if (opts.depth) go.push(`depth ${opts.depth}`);
    if (opts.movetime) go.push(`movetime ${opts.movetime}`);
    if (!opts.depth && !opts.movetime) go.push('depth 16');

    this.lines = [];
    const guardMs = (opts.movetime ?? 20000) + 10000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<SearchResultShape[]>((resolve, reject) => {
      timer = setTimeout(() => {
        this.pending = null;
        this.send('stop');
        reject(new Error(`search timeout after ${guardMs}ms`));
      }, guardMs);
      this.pending = {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
    });
    this.send(go.join(' '));

    const results = await promise;
    if (multiPv > 1) this.send('setoption name MultiPV value 1');
    return results;
  }

  quit(): void {
    if (!this.worker) return;
    this.send('quit');
    this.worker.terminate();
    this.ready = false;
    this.pending = null;
  }
}
