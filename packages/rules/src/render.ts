import type { Fact } from './types';

/** blunt = 轻度毒舌（默认）；plain = 正经讲解 */
export type Tone = 'blunt' | 'plain';

/** 把一条事实渲染成一句人话。模板只是事实的 renderer，不参与判断。 */
export function renderFact(fact: Fact, tone: Tone = 'blunt'): string {
  switch (fact.type) {
    case 'hanging_piece':
      return tone === 'blunt'
        ? `白给：你的${fact.piece}在 ${fact.square} 完全没人保，对面${fact.attacker}上来就是一口，净赚 ${fact.gain}。`
        : `这一步之后，${fact.square} 的${fact.piece}失去保护，对手可以用${fact.attacker}白吃，净赚 ${fact.gain} 子力。`;
    case 'allow_mate':
      return tone === 'blunt'
        ? '完了，对面下一步就能将死你，这一步等于把脖子伸出去。'
        : `这一步之后，对手有 ${fact.mateIn} 步内的将杀，你的老将已经无路可走。`;
    case 'bad_trade':
      return tone === 'blunt'
        ? `这不叫兑子，叫送：你用${fact.lost.join('、')}换了${fact.won.join(
            '、'
          )}，净亏 ${Math.abs(fact.delta)}。`
        : `这次交换不划算：用${fact.lost.join('、')}换${fact.won.join('、')}，净亏 ${Math.abs(
            fact.delta
          )} 子力。`;
    case 'missed_capture':
      return tone === 'blunt'
        ? `对面 ${fact.square} 的${fact.piece}白给你吃（净赚 ${fact.gain}），你居然不吃，先吃啊。`
        : `本回合有白吃对方${fact.piece}的机会（${fact.square}，可用${fact.by}吃，净赚 ${fact.gain}），但这一步没有走。`;
    case 'missed_threat':
      return tone === 'blunt'
        ? `对手早就在盯你 ${fact.square} 的${fact.target}了（${fact.by}可以白吃，净赚 ${fact.gain}），你这步完全没管。`
        : `对手对 ${fact.square} 的${fact.target}一直存在白吃威胁（${fact.by}，净赚 ${fact.gain}），这一步没有处理。`;
  }
}

export function renderFacts(facts: Fact[], tone: Tone = 'blunt'): string[] {
  return facts.map((f) => renderFact(f, tone));
}
