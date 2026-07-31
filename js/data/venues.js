// ============ AI 领域顶会 / 顶刊目录与关键节点 ============
// deadline / notify 为「下一轮」具体日期（YYYY-MM-DD），依据 CCF DDL（ccfddl.top / myhuiban 等公开汇总）整理；
// 双年会根据年份标记 biennial，实际以官网公告为准。venues.js 仅作提醒参考。
export const VENUES = [
  { id: 'CVPR', full: 'IEEE/CVF Conference on Computer Vision and Pattern Recognition', area: '计算机视觉', deadline: '2026-11-14', notify: '2027-02-20', conf: '2027-06-03', site: 'https://cvpr.thecvf.com/', cvf: true },
  { id: 'ICCV', full: 'International Conference on Computer Vision', area: '计算机视觉', deadline: '2027-03-06', notify: '2027-06-24', conf: '2027-10-19', site: 'https://iccv.thecvf.com/', cvf: true, biennial: 'odd' },
  { id: 'ECCV', full: 'European Conference on Computer Vision', area: '计算机视觉', deadline: '2028-03-07', notify: '2028-07-01', conf: '2028-09-12', site: 'https://eccv.ecva.net/', biennial: 'even' },
  { id: 'NeurIPS', full: 'Conference on Neural Information Processing Systems', area: '机器学习', deadline: '2027-05-14', notify: '2027-09-24', conf: '2027-12-06', site: 'https://neurips.cc/', openreview: true },
  { id: 'ICML', full: 'International Conference on Machine Learning', area: '机器学习', deadline: '2027-01-23', notify: '2027-05-01', conf: '2027-07-06', site: 'https://icml.cc/', openreview: true },
  { id: 'ICLR', full: 'International Conference on Learning Representations', area: '机器学习', deadline: '2026-09-17', notify: '2027-01-22', conf: '2027-05-01', site: 'https://iclr.cc/', openreview: true },
  { id: 'AAAI', full: 'AAAI Conference on Artificial Intelligence', area: '人工智能', deadline: '2027-08-01', notify: '2027-11-30', conf: '2028-02-16', site: 'https://aaai.org/conference/aaai/' },
  { id: 'IJCAI', full: 'International Joint Conference on Artificial Intelligence', area: '人工智能', deadline: '2027-01-31', notify: '2027-04-28', conf: '2027-08-15', site: 'https://www.ijcai.org/' },
  { id: 'ACL', full: 'Annual Meeting of the Association for Computational Linguistics', area: '自然语言处理', deadline: '2027-02-15', notify: '2027-05-15', conf: '2027-08-17', site: 'https://www.aclweb.org/' },
  { id: 'EMNLP', full: 'Conference on Empirical Methods in NLP', area: '自然语言处理', deadline: '2027-05-27', notify: '2027-08-20', conf: '2027-10-24', site: 'https://2027.emnlp.org/' },
  { id: 'SIGGRAPH', full: 'ACM SIGGRAPH', area: '图形学', deadline: '2027-01-22', notify: '2027-05-05', conf: '2027-08-08', site: 'https://www.siggraph.org/' },
  // ACM MM 为年度会议；2026 周期（投稿 2026-04-01 / 放榜 2026-07-07 / 会期 2026-11-10 里约）已结束，
  // 此处列为「下一轮 2027」的预计节点（官方 2027 CFP 尚未发布，按历年 4 月投稿 / 7 月放榜 / 10–11 月会期 规律推算，以官网为准）。
  { id: 'ACMMM', full: 'ACM International Conference on Multimedia', area: '多媒体 / 多模态', deadline: '2027-04-01', notify: '2027-07-07', conf: '2027-10-27', site: 'https://2027.acmmm.org/', openreview: true },
  { id: 'CoRL', full: 'Conference on Robot Learning', area: '机器人学习', deadline: '2027-04-30', notify: '2027-06-30', conf: '2027-11-01', site: 'https://www.corl.org/', openreview: true },
  { id: 'RSS', full: 'Robotics: Science and Systems', area: '机器人', deadline: '2027-01-24', notify: '2027-04-15', conf: '2027-06-22', site: 'https://roboticsconference.org/' },
  { id: 'ICRA', full: 'IEEE International Conference on Robotics and Automation', area: '机器人', deadline: '2026-09-15', notify: '2027-01-31', conf: '2027-05-24', site: 'https://www.ieee-ras.org/' },
  { id: 'IROS', full: 'IEEE/RSJ International Conference on Intelligent Robots and Systems', area: '机器人', deadline: '2027-03-01', notify: '2027-06-30', conf: '2027-10-18', site: 'https://www.iros.org/' },
  { id: 'TPAMI', full: 'IEEE Trans. on Pattern Analysis and Machine Intelligence', area: '顶刊（随时投稿）', site: 'https://www.computer.org/csdl/journal/tp', journal: true },
  { id: 'IJCV', full: 'International Journal of Computer Vision', area: '顶刊（随时投稿）', site: 'https://www.springer.com/journal/11263', journal: true },
  { id: 'TRO', full: 'IEEE Transactions on Robotics', area: '顶刊（随时投稿）', site: 'https://www.ieee-ras.org/publications/t-ro', journal: true },
  { id: 'WACV', full: 'Winter Conference on Applications of Computer Vision', area: '计算机视觉', deadline: '2026-08-29', notify: '2027-01-03', conf: '2027-01-05', site: 'https://wacv.thecvf.com/', cvf: true },
  { id: '3DV', full: 'International Conference on 3D Vision', area: '三维视觉', deadline: '2026-08-29', notify: '2027-01-15', conf: '2027-04-06', site: 'https://3dvconf.github.io/' }
];

export const NEWS_SOURCES = [
  { id: 'hn', name: 'Hacker News · AI 热帖', desc: '全球开发者社区高热度 AI 话题', on: true },
  { id: 'gh', name: 'GitHub · AI 新星项目', desc: '近期高星标杆开源项目', on: true },
  { id: 'pwc', name: 'Papers with Code · 趋势', desc: '带代码的热门论文', on: true },
  { id: 'deadline', name: '顶会截稿倒计时', desc: '来自内置顶会目录', on: true }
];

export const BLOG_LINKS = [
  { name: 'Google Research Blog', url: 'https://research.google/blog/' },
  { name: 'OpenAI Research', url: 'https://openai.com/research' },
  { name: 'DeepMind Blog', url: 'https://deepmind.google/discover/blog/' },
  { name: 'Meta AI Blog', url: 'https://ai.meta.com/blog/' },
  { name: 'BAIR Blog', url: 'https://bair.berkeley.edu/blog/' },
  { name: 'Lil’Log', url: 'https://lilianweng.github.io/' },
  { name: '机器之心', url: 'https://www.jiqizhixin.com/' },
  { name: '量子位', url: 'https://www.qbitai.com/' }
];
