// ============ 招聘资讯收集：信息源 / 目标企业 ============
// 说明：以下链接均为各平台/企业官方招聘主站，具体岗位以官网实时发布为准。

// 通用信息源（日常实习 & 校招都用得到）
export const JOB_PLATFORMS = [
  { name: '实习僧', url: 'https://www.shixiseng.com', note: '日常实习聚合，可按城市/岗位/薪资筛选' },
  { name: 'BOSS直聘', url: 'https://www.zhipin.com', note: '大厂实习/社招，可直聊 HR' },
  { name: '牛客网', url: 'https://www.nowcoder.com', note: '校招/实习题库、内推与面经社区' },
  { name: '应届生求职网', url: 'https://www.yingjiesheng.com', note: '校招资讯最全，提前批/秋招/春招汇总' },
  { name: '国聘网', url: 'https://www.iguopin.com', note: '央企/国企官方招聘平台' },
  { name: '互联派', url: 'https://www.hulianpai.com', note: '大厂实习内推与薪资爆料' }
];

// 日常实习目标：以上海为主的大厂（博一，计划 2027 上半年上海实习）
export const DAILY_INTERNS = [
  { company: '字节跳动', city: '上海', type: '大厂', tag: '算法 / 研究', url: 'https://jobs.bytedance.com/campus', note: '上海 AI Lab、抖音/豆包团队实习多，提前批 1–2 月启动' },
  { company: '腾讯', city: '上海', type: '大厂', tag: '算法 / 研究', url: 'https://careers.tencent.com', note: '腾讯优图、AI Lab 上海，实习转正机会多' },
  { company: '阿里巴巴', city: '上海', type: '大厂', tag: '算法 / 后端', url: 'https://talent.alibaba.com', note: '本地生活/饿了么、达摩院，上海岗位丰富' },
  { company: '美团', city: '上海', type: '大厂', tag: '算法 / 研发', url: 'https://zhaopin.meituan.com', note: '无人机、视觉、大模型团队在上海有实习岗' },
  { company: '拼多多', city: '上海', type: '大厂', tag: '算法 / 研发', url: 'https://careers.pinduoduo.com', note: '总部就在上海，推荐/搜索/大模型团队常年招实习' },
  { company: '小红书', city: '上海', type: '大厂', tag: '算法 / 研发', url: 'https://job.xiaohongshu.com', note: '总部上海，社区/推荐/多模态方向' },
  { company: '米哈游', city: '上海', type: '大厂', tag: '图形 / 算法', url: 'https://www.mihoyo.com', note: '总部上海，AI、图形、多模态研究岗，福利好' },
  { company: '哔哩哔哩', city: '上海', type: '大厂', tag: '算法 / 研发', url: 'https://www.bilibili.com/blackboard/careers.html', note: '总部上海，推荐/内容理解方向' },
  { company: '携程', city: '上海', type: '大厂', tag: '算法 / 研发', url: 'https://careers.trip.com', note: '总部上海，NLP、搜索、推荐团队' },
  { company: '百度', city: '上海', type: '大厂', tag: '算法 / 研发', url: 'https://talent.baidu.com', note: '文心大模型相关团队在上海有岗' },
  { company: '商汤科技', city: '上海', type: '大厂', tag: '研究 / 算法', url: 'https://www.sensetime.com/cn/career', note: '总部上海，计算机视觉研究强，适合 CV 方向' },
  { company: '阶跃星辰', city: '上海', type: '大厂', tag: '大模型 / 研究', url: 'https://www.stepfun.com', note: '上海本土大模型独角兽，研究氛围浓' },
  { company: 'MiniMax', city: '上海', type: '大厂', tag: '大模型 / 算法', url: 'https://www.minimax.io/careers', note: '上海大模型创业公司，多模态方向' },
  { company: '智谱 AI', city: '北京', type: '大厂', tag: '大模型 / 研究', url: 'https://www.zhipuai.cn/careers', note: 'GLM 系列，可远程/北京，AI 研究顶级' },
  { company: '上海人工智能实验室', city: '上海', type: '大厂', tag: '研究', url: 'https://www.shlab.org.cn', note: '国家级实验室，书生大模型，科研实习含金量高' },
  { company: '微软亚洲研究院', city: '北京', type: '大厂', tag: '研究', url: 'https://www.msra.cn/careers', note: 'MSRA 实习含金量极高，可远程/北京' }
];

// 校招目标：2029 届，主战场 北京 / 天津，大厂 + 优质国企
export const CAMPUS_TARGETS = [
  // —— 北京 · 大厂 ——
  { company: '字节跳动', city: '北京', type: '大厂', tag: '算法 / 研发', url: 'https://jobs.bytedance.com/campus', note: '总部北京，秋招体量最大，AI 岗多' },
  { company: '腾讯', city: '北京', type: '大厂', tag: '算法 / 研发', url: 'https://careers.tencent.com', note: '北京亦庄/中关村，微信/云/AI 团队' },
  { company: '阿里巴巴', city: '北京', type: '大厂', tag: '算法 / 研发', url: 'https://talent.alibaba.com', note: '北京研发中心，达摩院分部' },
  { company: '百度', city: '北京', type: '大厂', tag: '算法 / 研发', url: 'https://talent.baidu.com', note: '总部北京，文心大模型、自动驾驶' },
  { company: '美团', city: '北京', type: '大厂', tag: '算法 / 研发', url: 'https://zhaopin.meituan.com', note: '总部北京，到家/到店/大模型' },
  { company: '京东', city: '北京', type: '大厂', tag: '研发 / 算法', url: 'https://campus.jd.com', note: '总部北京亦庄，零售科技/物流科技' },
  { company: '小米', city: '北京', type: '大厂', tag: '研发 / 算法', url: 'https://hr.xiaomi.com', note: '总部北京，手机/IoT/大模型' },
  { company: '快手', city: '北京', type: '大厂', tag: '算法 / 研发', url: 'https://www.kuaishou.com/about/careers', note: '总部北京，推荐/视频理解' },
  { company: '滴滴', city: '北京', type: '大厂', tag: '算法 / 研发', url: 'https://www.didiglobal.com', note: '总部北京，地图/自动驾驶' },
  { company: '网易', city: '北京', type: '大厂', tag: '研发 / 算法', url: 'https://hr.163.com', note: '北京研发中心，游戏/有道/云音乐' },
  { company: '寒武纪', city: '北京', type: '大厂', tag: '芯片 / 算法', url: 'https://www.cambricon.com', note: 'AI 芯片龙头，软硬结合' },
  // —— 北京 · 国企 / 研究院 ——
  { company: '国家电网（北京）', city: '北京', type: '国企', tag: 'IT / 研发', url: 'https://zhaopin.sgcc.com.cn', note: '稳定高福利，信通/电科院' },
  { company: '中国移动通信研究院', city: '北京', type: '国企', tag: '算法 / 研发', url: 'https://www.10086.cn', note: '央企，6G/AI 研究岗' },
  { company: '中国电子科技集团', city: '北京', type: '国企', tag: '算法 / 研发', url: 'https://www.cetc.com.cn', note: '军工电子国家队，研究所众多' },
  // —— 天津 · 国企（待遇优厚）——
  { company: '中海油天津分公司', city: '天津', type: '国企', tag: 'IT / 海工 / 数字化', url: 'https://www.cnooc.com.cn', note: '★ 天津待遇优厚国企，数字化/IT/海工研发岗，重视双一流与博士', hot: true },
  { company: '中芯国际（天津）', city: '天津', type: '国企', tag: '半导体 / 工艺', url: 'https://www.smics.com', note: '晶圆制造龙头，天津厂扩产，研发/工艺岗' },
  { company: '飞腾信息（天津）', city: '天津', type: '国企', tag: '芯片 / 研发', url: 'https://www.phytium.com.cn', note: '国产 CPU，天津基地，软硬件研发' },
  { company: '麒麟软件（天津）', city: '天津', type: '国企', tag: '操作系统 / 研发', url: 'https://www.kylinsec.com.cn', note: '国产操作系统，天津总部' },
  { company: '中科曙光（天津）', city: '天津', type: '国企', tag: '高性能计算', url: 'https://www.sugon.com', note: '国产服务器/超算，天津产业基地' },
  { company: '国家电网（天津）', city: '天津', type: '国企', tag: 'IT / 电力', url: 'https://zhaopin.sgcc.com.cn', note: '天津电力，稳定高福利' },
  { company: '中国航天科技集团（天津）', city: '天津', type: '国企', tag: '航天 / 软件', url: 'https://www.spacechina.com', note: '一院/五院天津基地，航天软件/控制' }
];

// ============ 腾讯实时岗位快照（由 tencent-campus-recruit 技能抓取自 join.qq.com）============
// 静态站无法实时刷新腾讯岗位，故以「快照 + 官网直达」呈现；岗位会动态变化，点链接看最新。
export const TENCENT_SNAPSHOT = {
  fetchedAt: '2026-07-31',
  note: '腾讯 AI / 计算机视觉 / 多模态 / 大模型方向的校招与实习岗位快照，来自腾讯校招官网 join.qq.com。优图实验室（上海）是腾讯 CV/多模态研究核心，与本方向高度相关。',
  items: [
    { title: '优图实验室-原生多模态预训练技术研究', unit: '优图实验室', dir: '多模态', cities: '上海', url: 'https://join.qq.com/post_detail.html?postid=1280227308716025856' },
    { title: '优图实验室-原生多模态Infra技术研究', unit: '优图实验室', dir: '多模态', cities: '上海', url: 'https://join.qq.com/post_detail.html?postid=1280227308716025861' },
    { title: '优图实验室-视频全模态理解基础技术研究', unit: '优图实验室', dir: '多模态', cities: '上海', url: 'https://join.qq.com/post_detail.html?postid=1280227296812591104' },
    { title: '优图实验室-高精3D生成技术研究', unit: '优图实验室', dir: '3D生成', cities: '上海', url: 'https://join.qq.com/post_detail.html?postid=1274481034578500765' },
    { title: 'WXG-WeLM 多模态大模型基座建设', unit: '微信·WeLM', dir: '多模态大模型', cities: '深圳总部 北京 上海', url: 'https://join.qq.com/post_detail.html?postid=1231829074687944863' },
    { title: '微信-大模型Agent系统设计与研究', unit: '微信', dir: 'Agent', cities: '深圳总部 北京 上海', url: 'https://join.qq.com/post_detail.html?postid=1231829074687944861' },
    { title: '混元-大模型infra稳定性研究', unit: '混元大模型', dir: '大模型', cities: '北京 上海', url: 'https://join.qq.com/post_detail.html?postid=1231829074687944772' },
    { title: 'AI Agent研究', unit: '腾讯AI', dir: 'Agent', cities: '上海', url: 'https://join.qq.com/post_detail.html?postid=1231829074692139149' },
    { title: '医疗大模型的相关研究', unit: '腾讯AI', dir: '大模型', cities: '上海', url: 'https://join.qq.com/post_detail.html?postid=1271996654375354368' },
    { title: 'AI安全技术工程师（风控算法）', unit: '安全', dir: '算法', cities: '深圳总部 北京 上海 广州', url: 'https://join.qq.com/post_detail.html?postid=1154876866054932480' },
    { title: '算法-推荐算法方向', unit: '腾讯', dir: '推荐算法', cities: '深圳总部 北京 上海 广州', url: 'https://join.qq.com/post_detail.html?postid=1211674462290972672' },
    { title: '算法-推荐算法方向', unit: '腾讯', dir: '推荐算法', cities: '深圳总部 北京 上海 广州', url: 'https://join.qq.com/post_detail.html?postid=1150119851554307072' },
    { title: '算法-数据科学方向', unit: '腾讯', dir: '数据科学', cities: '深圳总部 北京 上海 广州 成都', url: 'https://join.qq.com/post_detail.html?postid=1211674464354570240' }
  ]
};

// ============ 小红书求职关键词（静态站无法实时抓取，提供检索直达）============
// 小红书是实习/校招经验、内推、面经的高频内容源；点关键词直达站内搜索。
export const XHS_KEYWORDS = [
  { kw: '上海 算法实习', note: '上海大厂算法日常实习经验 / 内推' },
  { kw: '腾讯优图 实习', note: '优图实验室 CV / 多模态实习' },
  { kw: '字节 算法实习 内推', note: '字节 AI Lab 内推与面经' },
  { kw: '小红书 算法实习', note: '小红书社区 / 推荐 / 多模态实习' },
  { kw: '计算机视觉 实习', note: 'CV 方向实习岗位与作品集' },
  { kw: '多模态 大模型 实习', note: '多模态 / 大模型研究实习' },
  { kw: '大厂 日常实习 转正', note: '日常实习转正经验' },
  { kw: '秋招 算法 面经', note: '算法岗秋招面经合集' },
  { kw: 'AI 算法岗 薪资 爆料', note: '薪资与 HC 爆料（仅供参考）' }
];

// 小红书站内搜索直达
export const XHS_SEARCH = k => 'https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent(k);

// ============ 微信公众号精选（静态站无法实时抓取，提供搜一搜直达）============
export const WECHAT_OFFICIAL = [
  { name: '机器之心', note: 'AI 前沿论文与产业动态' },
  { name: '量子位', note: 'AI 技术与应用快讯' },
  { name: '计算机视觉life', note: 'CV 方向干货与招聘' },
  { name: '新智元', note: '通用人工智能综合资讯' },
  { name: 'AI科技评论', note: '学术界与工业界观点' },
  { name: '自动驾驶之心', note: '自动驾驶 / 机器人视觉' },
  { name: '腾讯技术工程', note: '腾讯一线技术实践' }
];
// 微信搜一搜直达（在微信内打开效果更好）
export const WECHAT_SEARCH = k => 'https://weixin.qq.com/s?query=' + encodeURIComponent(k);

