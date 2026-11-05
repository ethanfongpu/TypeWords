import type { Expression, LearnerProfile, Lesson } from '../types/scenario.ts'

export const defaultProfile: LearnerProfile = {
  name: '',
  role: '',
  product: '',
  category: '',
  audience: '',
  action: '',
  dailyMinutes: 15,
}

// Original beginner course text, reviewed as complete sentences, not arbitrary slot concatenation.
export function starterLessons(profile: LearnerProfile = defaultProfile): Lesson[] {
  const name = profile.name.trim() || 'Alex'
  const make = (
    id: string,
    english: string,
    chinese: string,
    question: string,
    questionChinese: string,
    note: string,
    hint: string,
    choices: string[],
    accepted: string[] = [],
    sample = false
  ): Expression => ({
    id,
    english,
    chinese,
    question,
    questionChinese,
    note,
    hint,
    choices,
    accepted: [english, ...accepted],
    sample,
  })
  return [
    {
      id: 'introduce',
      title: '你好，我叫……',
      goal: '听懂名字问题，说出自己的名字',
      expressions: [
        make(
          'hello',
          'Hello.',
          '你好。',
          'Hello.',
          '对方向你问好。',
          'Hello 是常见的问候。先打个招呼就很好。',
          'Hel…',
          ['你好。', '谢谢。', '再见。']
        ),
        make(
          'name',
          `I'm ${name}.`,
          `我叫 ${name}。`,
          "What's your name?",
          '对方在问你的名字。',
          "I'm 是 I am 的缩写。这里用来介绍名字。",
          "I'm …",
          [`我叫 ${name}。`, '我做销售工作。', '请说慢一点。'],
          [`I am ${name}.`, `My name is ${name}.`],
          !profile.name.trim()
        ),
        make(
          'meet',
          'Nice to meet you, too.',
          '我也很高兴认识你。',
          'Nice to meet you.',
          '对方说很高兴认识你。',
          'too 放在句尾，表示“也”。',
          'Nice to …',
          ['我也很高兴认识你。', '请再说一遍。', '这是一本书。']
        ),
      ],
    },
    {
      id: 'work',
      title: '我做什么工作',
      goal: '用一句话介绍自己的工作',
      expressions: [
        make(
          'sales',
          'I work in sales.',
          '我做销售工作。',
          'What do you do?',
          '对方问你做什么工作。',
          'work 是工作；in sales 表示从事销售。这里是练习样例。',
          'I work …',
          ['我做销售工作。', '我叫 Alex。', '请稍等。'],
          [],
          true
        ),
        make(
          'sell',
          'I sell books.',
          '我卖书。',
          'What do you sell?',
          '对方问你卖什么。',
          'sell 是卖；books 是书（复数）。先练习完整的样例。',
          'I sell …',
          ['我卖书。', '我喜欢音乐。', '请再说一遍。'],
          [],
          true
        ),
      ],
    },
    {
      id: 'product',
      title: '介绍一个产品',
      goal: '用两句说明眼前的产品是什么',
      expressions: [
        make(
          'this',
          'This is a speaker.',
          '这是一个音箱。',
          'What is this?',
          '对方问这是什么。',
          'This is… 用来介绍眼前的事物。a speaker 是一个音箱。',
          'This is …',
          ['这是一个音箱。', '它适合孩子。', '请说慢一点。'],
          ["It's a speaker.", 'It is a speaker.'],
          true
        ),
        make(
          'small',
          "It's small.",
          '它很小。',
          'Is it big?',
          '对方问它大不大。',
          "It's 是 It is 的缩写；small 是小的。",
          "It's …",
          ['它很小。', '我卖书。', '很高兴认识你。'],
          ['It is small.', "No, it's small."],
          true
        ),
      ],
    },
    {
      id: 'audience',
      title: '它适合谁',
      goal: '回答产品适合什么人',
      expressions: [
        make(
          'kids',
          "It's for kids.",
          '它适合孩子。',
          'Who is it for?',
          '对方问它适合谁。',
          'for 表示给、适合；kids 是孩子们。样例不代表真实产品信息。',
          "It's for …",
          ['它适合孩子。', '它很小。', '我做销售工作。'],
          ['It is for kids.'],
          true
        ),
        make(
          'helps',
          'It helps kids read.',
          '它帮助孩子阅读。',
          'How does it help?',
          '对方问它怎样帮助使用者。',
          'helps…read 表示帮助……阅读。这是虚构的阅读产品样例。',
          'It helps …',
          ['它帮助孩子阅读。', '请说慢一点。', '这是一个音箱。'],
          [],
          true
        ),
      ],
    },
    {
      id: 'feature',
      title: '说一个用途',
      goal: '介绍一个简单功能',
      expressions: [
        make(
          'music',
          'You can play music.',
          '你可以播放音乐。',
          'What can I do with it?',
          '对方问可以用它做什么。',
          'can 后面接动作；play music 是播放音乐。这是音箱样例。',
          'You can …',
          ['你可以播放音乐。', '我也很高兴认识你。', '我做销售工作。'],
          [],
          true
        ),
        make(
          'easy',
          "It's easy to use.",
          '它容易使用。',
          'Is it easy to use?',
          '对方问它是否容易使用。',
          'easy 是容易的；to use 表示使用。真实产品是否易用需要自己确认。',
          "It's easy …",
          ['它容易使用。', '它适合孩子。', '请再说一遍。'],
          ['It is easy to use.', "Yes, it's easy to use."],
          true
        ),
      ],
    },
    {
      id: 'help',
      title: '没听懂，也能继续',
      goal: '请求重复、放慢，遇到未知问题先核实',
      expressions: [
        make(
          'again',
          'Please say that again.',
          '请再说一遍。',
          'Sorry?',
          '你没有听清，想请对方重复。',
          'Please 让请求更礼貌；again 表示再一次。',
          'Please say …',
          ['请再说一遍。', '这是一个音箱。', '我卖书。'],
          ['Could you say that again?', 'Can you say that again?']
        ),
        make(
          'slow',
          'Please speak slowly.',
          '请说慢一点。',
          'How can I help?',
          '对方说得太快，请他慢一点。',
          'speak 是说话；slowly 是慢慢地。',
          'Please speak …',
          ['请说慢一点。', '我叫 Alex。', '你可以播放音乐。'],
          ['Could you speak slowly?']
        ),
        make(
          'check',
          'Let me check.',
          '让我核实一下。',
          'How much is it?',
          '对方问价格，你还不能确认。',
          '不确定时先核实。不要猜测价格或作出承诺。',
          'Let me …',
          ['让我核实一下。', '我也很高兴认识你。', '它很小。']
        ),
      ],
    },
  ]
}
