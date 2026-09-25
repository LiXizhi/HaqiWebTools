// Authored bilingual construction bank. Each line is a distinct question/answer
// construction, not a word-level duplicate counted as another pattern.
const source=`
认识事物|What is this?|这是什么？|This is {thing}.|这是{thing}。
描述所见|What can you see?|你能看见什么？|I can see {thing}.|我能看见{thing}。
表达拥有|What do you have?|你有什么？|I have {thing}.|我有{thing}。
表达需要|What do you need?|你需要什么？|I need {thing}.|我需要{thing}。
礼貌索取|What would you like?|你想要什么？|I would like {thing}, please.|我想要{thing}，谢谢。
询问借用|How would you ask to borrow it?|你会怎样开口借用它？|May I borrow {thing}?|我可以借用{thing}吗？
寻找物品|What are you looking for?|你在找什么？|I am looking for {thing}.|我在找{thing}。
谈论使用|What do you use?|你使用什么？|I use {thing}.|我使用{thing}。
谈论携带|What are you carrying?|你带着什么？|I am carrying {thing}.|我带着{thing}。
描述找到|What did you find?|你找到了什么？|I found {thing}.|我找到了{thing}。
介绍物主|Whose is this?|这是谁的？|It is mine.|这是我的。
确认物品|Is this yours?|这是你的吗？|Yes, it belongs to me.|是的，它是我的。
表达缺少|What do you not have?|你没有什么？|I do not have {thing}.|我没有{thing}。
请求展示|What would you like me to show you?|你想让我给你看什么？|Please show me {thing}.|请给我看看{thing}。
提出给予|What can you offer?|你能提供什么？|I can give you {thing}.|我可以给你{thing}。
询问价格|How would you ask the price?|你会怎样问价钱？|How much is this?|这个多少钱？
询问颜色|How would you ask about its color?|你会怎样询问它的颜色？|What color is it?|它是什么颜色？
询问数量|How would you ask the number?|你会怎样询问数量？|How many are there?|有多少个？
请求比较|How would you ask to compare them?|你会怎样请求比较它们？|May I compare these two?|我可以比较这两个吗？
说明用途|What is it for?|它是做什么用的？|It is for {activity}.|它是用来{activity}的。
谈论喜好|What do you like doing?|你喜欢做什么？|I like {activity}.|我喜欢{activity}。
表达热爱|What do you love doing?|你热爱做什么？|I love {activity}.|我热爱{activity}。
表达享受|What do you enjoy?|你享受什么活动？|I enjoy {activity}.|我享受{activity}。
表达偏好|What do you prefer doing?|你更喜欢做什么？|I prefer {activity}.|我更喜欢{activity}。
表达兴趣|What are you interested in?|你对什么感兴趣？|I am interested in {activity}.|我对{activity}感兴趣。
尝试活动|What would you like to try?|你想尝试什么？|I would like to try {activity}.|我想尝试{activity}。
开始活动|What shall we start with?|我们先做什么？|Let us start with {activity}.|我们先从{activity}开始吧。
结束活动|What have you finished doing?|你已经做完了什么？|I have finished {activity}.|我已经完成了{activity}。
继续活动|What should we keep doing?|我们应该继续做什么？|We should keep {activity}.|我们应该继续{activity}。
暂停活动|What shall we stop doing for a moment?|我们暂时停止做什么？|Let us stop {activity} for a moment.|我们暂时停止{activity}吧。
表达愿望|What do you want to do?|你想做什么？|I want to {action}.|我想{action}。
表达打算|What are you going to do?|你打算做什么？|I am going to {action}.|我打算{action}。
表达计划|What do you plan to do?|你计划做什么？|I plan to {action}.|我计划{action}。
表达希望|What do you hope to do?|你希望做什么？|I hope to {action}.|我希望{action}。
表达准备|What are you ready to do?|你准备好做什么了？|I am ready to {action}.|我准备好{action}了。
表达决定|What have you decided to do?|你决定做什么？|I have decided to {action}.|我决定{action}。
表达能力|What can you do?|你会做什么？|I can {action}.|我会{action}。
表示不会|What can you not do yet?|你还不会做什么？|I cannot {action} yet.|我还不会{action}。
表示学习|What are you learning to do?|你正在学做什么？|I am learning to {action}.|我正在学{action}。
请求教学|What would you like me to teach you?|你想让我教你什么？|Please teach me how to {action}.|请教我怎样{action}。
请求帮助|What do you need help with?|你需要什么帮助？|Please help me {action}.|请帮我{action}。
主动帮助|How can you help me?|你能怎样帮我？|I can help you {action}.|我可以帮你{action}。
请求许可|What would you like permission to do?|你想请求允许做什么？|May I {action}?|我可以{action}吗？
询问可能|What would you like to know is possible?|你想知道能不能做什么？|Can we {action}?|我们能{action}吗？
提出建议|What should we do?|我们应该做什么？|We should {action}.|我们应该{action}。
共同邀请|What shall we do together?|我们一起做什么？|Let us {action} together.|我们一起{action}吧。
礼貌邀请|How would you invite me?|你会怎样邀请我？|Would you like to {action} with me?|你愿意和我一起{action}吗？
征求意见|How would you suggest an idea?|你会怎样提出建议？|Shall we {action}?|我们{action}好吗？
提出替代|Can you suggest another activity?|你能建议另一项活动吗？|How about {activity}?|{activity}怎么样？
说明义务|What do you have to do?|你必须做什么？|I have to {action}.|我必须{action}。
说明必要|What do you need to do?|你需要做什么？|I need to {action}.|我需要{action}。
作出承诺|What will you do?|你会做什么？|I will {action}.|我会{action}。
表达可能|What might you do?|你可能做什么？|I might {action}.|我可能会{action}。
表示意愿|What would you be happy to do?|你乐意做什么？|I would be happy to {action}.|我很乐意{action}。
表达勇气|What are you not afraid to do?|你不怕做什么？|I am not afraid to {action}.|我不怕{action}。
说明顺序|What should we do first?|我们首先应该做什么？|First, we should {action}.|首先，我们应该{action}。
说明后续|What should we do next?|我们接下来应该做什么？|Next, we should {action}.|接下来，我们应该{action}。
提醒行动|What should I remember to do?|我应该记得做什么？|Remember to {action}.|记得{action}。
否定提醒|What should I not forget?|我不应该忘记什么？|Do not forget to {action}.|别忘了{action}。
重新尝试|What would you like to do again?|你想再做什么？|I would like to {action} again.|我想再{action}一次。
询问所在地|Where are we?|我们在哪里？|We are at {place}.|我们在{place}。
说明目的地|Where would you like to go?|你想去哪里？|I would like to go to {place}.|我想去{place}。
问路|What place are you looking for?|你在找什么地方？|Where is {place}?|{place}在哪里？
请求路线|How would you ask for directions?|你会怎样问路？|How do I get to {place}?|去{place}怎么走？
位置确认|Are we near our destination?|我们在目的地附近吗？|We are near {place}.|我们在{place}附近。
说明距离|Is it far away?|它很远吗？|It is not far from here.|它离这里不远。
约定见面|Where shall we meet?|我们在哪里见面？|Let us meet at {place}.|我们在{place}见面吧。
表达等候|Where will you wait?|你会在哪里等？|I will wait at {place}.|我会在{place}等。
描述前往|Where are you going?|你要去哪里？|I am going to {place}.|我要去{place}。
描述到达|Where have you arrived?|你到哪里了？|I have arrived at {place}.|我到{place}了。
说明离开|Where are you leaving from?|你正从哪里离开？|I am leaving {place}.|我正离开{place}。
描述返回|Where are you going back to?|你要回哪里？|I am going back to {place}.|我要回{place}。
描述参观|Where would you like to visit?|你想参观哪里？|I would like to visit {place}.|我想参观{place}。
邀请带路|How can you invite me to follow?|你会怎样请我跟上？|Please follow me to {place}.|请跟我去{place}。
请求带路|How would you ask me to lead?|你会怎样请我带路？|Please take me to {place}.|请带我去{place}。
辨别方向|Which way should we go?|我们应该往哪边走？|We should turn left.|我们应该左转。
直行路线|What should we do at this path?|在这条路上我们应该怎么走？|Go straight ahead.|一直向前走。
选择右转|What comes after going straight?|直走之后怎么走？|Then turn right.|然后右转。
询问远近|What would you like to know about the distance?|你想怎样询问距离？|Is {place} far from here?|{place}离这里远吗？
请求地图|What could help you find the way?|什么能帮你找到路？|Could I see the map, please?|请让我看看地图好吗？
说明来处|Where have you come from?|你刚从哪里来？|I have come from {place}.|我刚从{place}来。
报告迷路|What is the problem?|遇到了什么问题？|I am lost. Please help me.|我迷路了。请帮帮我。
确认路线|How would you check the route?|你会怎样确认路线？|Is this the way to {place}?|这是去{place}的路吗？
表达抵达愿望|Where do you hope to arrive?|你希望到达哪里？|I hope to arrive at {place} soon.|我希望很快到达{place}。
谈论所在活动|What can we do here?|我们在这里能做什么？|We can {action} here.|我们可以在这里{action}。
提出附近活动|What could we do nearby?|我们可以在附近做什么？|We could {action} nearby.|我们可以在附近{action}。
请求一起走|How would you ask for company?|你会怎样请人同行？|Can you come with me?|你能和我一起走吗？
表达陪同|Will you come with me?|你会和我一起走吗？|Yes, I will come with you.|会的，我会和你一起走。
约定返回|When will you come back?|你什么时候回来？|I will come back tomorrow.|我明天回来。
表达到访经历|Have you been here before?|你以前来过这里吗？|Yes, I have been here before.|是的，我以前来过这里。
说明原因|Why do you want to do this?|你为什么想这样做？|Because it is {quality}.|因为这很{quality}。
表达观点|What do you think of this activity?|你觉得这项活动怎么样？|I think it is {quality}.|我觉得这很{quality}。
征求评价|How would you ask for my opinion?|你会怎样征求我的意见？|Do you think it is {quality}?|你觉得这很{quality}吗？
说明感受|How do you feel?|你感觉怎么样？|I feel happy.|我感到开心。
表达疲劳|Do you need a break?|你需要休息吗？|Yes, I am a little tired.|是的，我有点累。
表达担心|How do you feel about trying?|对于尝试，你感觉怎么样？|I am a little worried.|我有点担心。
表达期待|Are you looking forward to it?|你期待这件事吗？|Yes, I am looking forward to {activity}.|是的，我期待{activity}。
表达自信|Do you think you can do it?|你觉得你能做到吗？|Yes, I think I can.|是的，我觉得我能。
表示不确定|Are you sure?|你确定吗？|I am not sure yet.|我还不确定。
表示确定|Have you made up your mind?|你拿定主意了吗？|Yes, I am sure.|是的，我确定。
比较容易|How does it feel now?|现在感觉如何？|It is easier than before.|这比以前容易了。
比较困难|Was it easy?|这容易吗？|It was harder than I expected.|这比我预想的难。
表达足够|Do we have enough time?|我们的时间够吗？|Yes, we have enough time.|是的，我们有足够的时间。
表示过量|Why should we take a break?|我们为什么应该休息？|We have done too much today.|我们今天做得太多了。
描述频率|How often do you do this?|你多久做一次？|I do this every day.|我每天都做。
描述时间|When would you like to start?|你想什么时候开始？|I would like to start now.|我想现在开始。
请求稍等|What would you say if you needed time?|你需要时间时会怎么说？|Please wait a moment.|请等一下。
表达尚未准备|Are you ready now?|你现在准备好了吗？|I am not ready yet.|我还没准备好。
谈论进步|What has changed?|有什么变化？|I can do it better now.|我现在能做得更好了。
表明努力|How will you approach this?|你会怎样做这件事？|I will do my best.|我会尽力。
表达条件|What will you do if you have time?|如果有时间，你会做什么？|If I have time, I will {action}.|如果有时间，我会{action}。
说明行动前提|What do you need before you start?|开始前你需要什么？|Before I start, I need {thing}.|开始前，我需要{thing}。
安排之后活动|What will you do after this?|这之后你会做什么？|After this, I will {action}.|这之后，我会{action}。
说明同时进行|What can we do while we wait?|等候时我们能做什么？|We can talk while we wait.|等候时我们可以聊天。
比较偏好|Would you rather try or watch?|你更想尝试还是观看？|I would rather try.|我更想尝试。
说明最爱|What is your favorite activity?|你最喜欢的活动是什么？|My favorite activity is {activity}.|我最喜欢的活动是{activity}。
表达曾经想法|What did you think at first?|你最初怎么想？|I thought it was difficult.|我原以为这很难。
提出重要性|Why should we practise?|我们为什么应该练习？|It is important to {action}.|{action}很重要。
描述学会|What have you learned?|你学会了什么？|I have learned how to {action}.|我学会了怎样{action}。
表达目标|What is your goal?|你的目标是什么？|My goal is to {action}.|我的目标是{action}。
礼貌问候|Hello! How are you?|你好！你好吗？|I am fine, thank you.|我很好，谢谢。
介绍姓名|What is your name?|你叫什么名字？|My name is Alex.|我叫亚历克斯。
表达初见|It is nice to meet you.|很高兴认识你。|Nice to meet you, too.|我也很高兴认识你。
询问姓名|What would you like to ask me?|你想问我什么？|What is your name?|你叫什么名字？
询问身份|How would you ask about my job?|你会怎样问我的工作？|What do you do here?|你在这里做什么工作？
介绍新来|Are you new here?|你是新来的吗？|Yes, this is my first visit.|是的，这是我第一次来。
请求交谈|How would you start a conversation?|你会怎样开始聊天？|May I talk with you?|我可以和你聊聊吗？
表达感谢|Did that help?|这有帮助吗？|Yes, thank you for your help.|有，谢谢你的帮助。
回应感谢|Thank you for helping me.|谢谢你帮助我。|You are welcome.|不客气。
礼貌道歉|What would you say after a mistake?|犯错后你会怎么说？|I am sorry. Let me try again.|对不起。让我再试一次。
回应道歉|I am sorry about that.|对此我很抱歉。|That is all right.|没关系。
请求重复|What if you did not hear me?|如果你没有听清我说的话呢？|Could you say that again, please?|请再说一遍好吗？
请求慢说|Am I speaking too fast?|我说得太快了吗？|Please speak more slowly.|请说慢一点。
确认理解|Do you understand now?|你现在明白了吗？|Yes, I understand now.|是的，我现在明白了。
表示没懂|Was that clear?|说明清楚了吗？|I do not understand yet.|我还没有明白。
请求解释|What would help you understand?|怎样能帮助你理解？|Could you explain that, please?|请解释一下好吗？
询问词义|What would you ask about a new word?|遇到新词你会问什么？|What does this word mean?|这个词是什么意思？
询问拼写|How would you ask me to spell it?|你会怎样请我拼写？|How do you spell that?|那怎么拼写？
请求举例|What would make the idea clearer?|怎样能把意思讲得更清楚？|Could you give me an example?|你能举个例子吗？
确认说法|How would you check your expression?|你会怎样确认自己的表达？|Is that the right way to say it?|这样说对吗？
礼貌同意|Do you agree with me?|你同意我吗？|Yes, I agree with you.|是的，我同意你。
礼貌不同意|Do you see it the same way?|你的看法一样吗？|I see it differently.|我的看法不同。
接受邀请|Would you like to join me?|你愿意加入我吗？|Yes, I would love to.|是的，我很愿意。
婉拒邀请|Can you join me now?|你现在能加入我吗？|Sorry, I cannot join you now.|抱歉，我现在不能加入你。
给予鼓励|I think this is difficult.|我觉得这很难。|Do not give up. Try again.|别放弃。再试一次。
表达关心|What would you ask a tired friend?|你会怎样问候疲惫的朋友？|Are you all right?|你还好吗？
请求休息|What would you say when tired?|累了你会怎么说？|May I take a break?|我可以休息一下吗？
表达赞赏|What would you say after a good effort?|别人努力做得很好时你会怎么说？|You did a great job.|你做得很好。
礼貌告别|Are you leaving now?|你现在要走了吗？|Yes, see you later.|是的，回头见。
祝愿顺利|What would you say before my trip?|我出发前你会说什么？|Have a good trip!|祝你旅途愉快！
`;
export const patterns=source.trim().split('\n').map((line,i)=>{
    const [title,qen,qzh,aen,azh]=line.split('|');
    return {id:`p${String(i+1).padStart(3,'0')}`,title,question:{en:qen,'zh-CN':qzh},answer:{en:aen,'zh-CN':azh}};
});
if(patterns.length!==150)throw Error(`Expected 150 patterns, got ${patterns.length}`);
