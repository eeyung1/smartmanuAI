export const controlChinese: Record<string, string> = {
  "YOUR ALERT PREFERENCES": "您的提醒偏好",
  "Stay in the loop.": "及时了解新机会。",
  "Choose one channel and a digest schedule. In this local prototype, email and Telegram are simulated: messages stay in a private local test sink. No real channel is connected.":
    "请选择一个渠道和摘要时间表。在此本地原型中，邮件和 Telegram 均为模拟：消息只保存在私有的本地测试收件箱中，未连接任何真实渠道。",
  "Digest settings": "摘要设置",
  "Email digest suppression:": "邮件摘要已被抑制：",
  ". Use another channel or contact support.":
    "。请改用其他渠道或联系支持人员。",
  "Enable local digest simulation": "启用本地摘要模拟",
  Channel: "渠道",
  "Email — local simulation": "邮件——本地模拟",
  "Telegram — local simulation": "Telegram——本地模拟",
  Frequency: "频率",
  "Daily at 09:00": "每天 09:00",
  "Monday at 09:00": "每周一 09:00",
  "IANA timezone": "IANA 时区",
  "I opt into opportunity digests in the local simulation. A live channel will need separate setup and consent.":
    "我同意接收本地模拟中的学习机会摘要。真实渠道需要单独设置并另行取得同意。",
  "Save digest settings": "保存摘要设置",
  "Create a local email unsubscribe test link": "创建本地邮件退订测试链接",
  "Open unsubscribe confirmation": "打开退订确认页",
  "· Local test link; keep it private.": "· 本地测试链接，请勿泄露。",
  "Saved state:": "已保存的状态：",
  ". Next scheduled time:": "。下次计划时间：",
  "Enabled for the local sink": "已为本地测试收件箱启用",
  Paused: "已暂停",
  None: "无",
  "Pause digests now": "立即暂停摘要",
  "Recent local digests": "最近的本地摘要",
  "Accepted by local sink": "已被本地测试收件箱接收",
  "No digests planned yet. The local digest worker runs separately.":
    "尚未生成摘要计划。本地摘要任务需单独运行。",
  "Digests contain at most 10 current unseen matches. Empty digests are skipped. English fallback is disclosed when a selected alert translation is unavailable.":
    "摘要最多包含 10 条当前尚未纳入摘要的匹配结果，空摘要将跳过。所选提醒模板语言不可用时，会明确说明已回退到英语。",
  "Telegram connection test": "Telegram 连接测试",
  "This is a local test flow, not a live Telegram bot. A simulated private-chat webhook creates a pending binding; confirmation here is required. Linking never enables digests automatically.":
    "这是本地测试流程，未连接真实的 Telegram 机器人。模拟私聊回调会创建待确认的绑定，需在此确认。绑定不会自动启用摘要。",
  "Status:": "状态：",
  " · Chat ending {suffix}": " · 聊天编号末尾为 {suffix}",
  "Connection tests are unavailable in this environment.":
    "此环境不支持连接测试。",
  "Create local linking code": "创建本地绑定码",
  "Private test command:": "私有测试命令：",
  "Expires:": "到期时间：",
  ". Keep this code private.": "。请勿泄露此码。",
  "Refresh connection status": "刷新连接状态",
  "Confirm this local binding": "确认此本地绑定",
  "Disconnect and cancel linking codes": "断开连接并作废绑定码",
  "Outbound delivery simulation": "对外投递模拟",
  "Only synthetic digests are eligible. These tests use fake provider credentials and an injected fixture transport. No live sender is connected.":
    "仅可使用模拟摘要进行测试。测试采用虚拟服务商凭证和注入的模拟传输，未连接真实发送服务。",
  "Prepare latest local digest for testing": "准备最新本地摘要以供测试",
  "Refresh delivery tests": "刷新投递测试",
  "Fixture provider accepted": "模拟服务商已接受",
  "· Attempts": "· 尝试次数",
  "Diagnostic code: {code}": "诊断代码：{code}",
  "No outbound tests yet.": "尚无对外投递测试。",
  "YOUR ACCOUNT": "您的账户",
  "Privacy controls.": "隐私控制。",
  "Export your application profile and activity, or request deletion. Both actions require a sign-in within the last ten minutes.":
    "导出应用内的个人资料和活动记录，或请求删除账户。两项操作均要求您在最近十分钟内登录。",
  "Export profile and activity": "导出个人资料和活动记录",
  "The JSON export excludes sign-in credentials, session/link tokens and private security material. It includes saved activity and notification settings.":
    "JSON 导出不包含登录凭证、会话或链接令牌及私密安全资料，包含已保存的活动记录和通知设置。",
  "Download account export": "下载账户数据导出文件",
  "Request account deletion": "请求删除账户",
  "This immediately pauses alerts, cancels pending work and signs you out on all devices. It cannot recall an already-started provider request. The worker removes your private application database records and local authentication mail, while keeping shared opportunities. Accounts with public review contributions need operator assistance. Provider records, security suppression markers and backup expiry still require a production retention policy.":
    "此操作会立即暂停提醒、取消待处理任务，并使您在所有设备上退出登录。已向服务商发起的请求无法撤回。清理任务会移除您的私有应用数据库记录和本地验证邮件，同时保留共享的学习机会。具有公开审核贡献的账户需要工作人员协助。服务商记录、安全抑制标记和备份到期处理仍需制定生产环境保留政策。",
  "Type DELETE to confirm": "输入 DELETE 以确认",
  "Request deletion and sign out": "请求删除并退出登录",
  "Check a receipt without signing in": "无需登录即可查询回执",
  "Check a deletion receipt": "查询删除回执",
  "The receipt grants access only to status, not account data. Keep it private. It is not saved in this browser.":
    "此回执仅能查询处理状态，不能访问账户数据。请妥善保管，不要泄露。浏览器不会保存此回执。",
  "Private receipt": "私有回执",
  "Check status": "查询状态",
  "ACCOUNT DELETION": "账户删除",
  "Deletion request status.": "删除请求状态。",
  "Unable to save notification settings.": "无法保存通知设置。",
  "Settings saved, but history could not refresh. Reload this page.":
    "设置已保存，但历史记录未能刷新，请重新加载页面。",
  "Local digest simulation enabled. No real messages will be sent.":
    "已启用本地摘要模拟，不会发送真实消息。",
  "Digests paused. Pending digests have been cancelled.":
    "摘要已暂停，待处理摘要已取消。",
  "Unable to create a local test link.": "无法创建本地测试链接。",
  "Unable to update connection.": "无法更新连接。",
  "Local test code created. It is single-use and expires in ten minutes.":
    "已创建本地测试码，仅可使用一次，十分钟后到期。",
  "Local binding confirmed. Live delivery is still disconnected.":
    "本地绑定已确认，真实投递仍未连接。",
  "Connection revoked and selected Telegram digests paused.":
    "连接已撤销，所选 Telegram 摘要已暂停。",
  "Unable to refresh connection.": "无法刷新连接。",
  "Unable to prepare a delivery test.": "无法准备投递测试。",
  "Unable to refresh local delivery tests.": "无法刷新本地投递测试。",
  "Local test prepared. A separate fixture worker processes it; no real provider is contacted.":
    "本地测试已准备就绪，将由单独的模拟任务处理，不会联系真实服务商。",
  "Local test status refreshed.": "本地测试状态已刷新。",
  "Unable to request deletion.": "无法请求删除。",
  "Deletion queued. You are signed out. Keep the private receipt below to check completion.":
    "删除请求已排队，您已退出登录。请保留下方私有回执以查询完成状态。",
  "Unable to read deletion status.": "无法查询删除状态。",
  "Application database account and local authentication mail purged. Operational suppression markers and backup expiry are separate.":
    "应用数据库中的账户及本地验证邮件已清理。运行所需的抑制标记和备份到期处理不在此次清理范围内。",
  "Deletion queued. Sessions are revoked and digests paused. A separate worker completes the purge.":
    "删除请求已排队，会话已撤销，摘要已暂停。清理将由单独的任务完成。",
  "Sign in again before exporting or deleting account data.":
    "导出或删除账户数据前，请重新登录。",
  "Account not found.": "未找到账户。",
  "Receipt not found.": "未找到回执。",
  "Deletion was already requested.": "已提交过删除请求。",
  "Public review contributions require operator-assisted deletion. No request was created.":
    "具有公开审核贡献的账户需由工作人员协助删除。本次未创建请求。",
  "Notification settings changed. Reload before saving.":
    "通知设置已更改，请重新加载后再保存。",
  "Email digests are suppressed after a bounce or complaint. Use another channel or contact support.":
    "因退信或投诉，邮件摘要已被抑制。请改用其他渠道或联系支持人员。",
  "Email digest preferences": "邮件摘要偏好",
  "Pause email digests": "暂停邮件摘要",
  "Opening this page does not change your settings. Confirm below to pause the email consent version associated with this link. It will not pause Telegram or authentication messages.":
    "打开此页面不会更改设置。请在下方确认，以暂停与此链接对应的邮件同意版本。此操作不会暂停 Telegram 或身份验证消息。",
  "This link is invalid. Sign in to manage your notification settings.":
    "此链接无效，请登录后管理通知设置。",
  "Local prototype. No real email provider is connected.":
    "本地原型，未连接真实邮件服务商。",
  "Email digest unsubscribe request processed.": "邮件摘要退订请求已处理。",
  Email: "邮件",
  "Pending confirmation": "待确认",
  "Locally confirmed": "已在本地确认",
  Disconnected: "未连接",
  Revoked: "已撤销",
  Blocked: "已屏蔽",
  "Queued for local worker": "已排队等待本地任务处理",
  "Ready for fixture worker": "已就绪，等待模拟任务处理",
  "Sending simulation": "正在模拟发送",
  "Retry queued": "重试已排队",
  "Waiting for quota": "等待额度",
  Failed: "已失败",
  "Uncertain — requires review": "结果不确定——需要人工核查",
  Suppressed: "已抑制",
  Bounce: "退信",
  Complaint: "投诉",
  "Draft catalogue record": "目录草稿记录",
  "Rejected catalogue record": "目录审核未通过的记录",
};
