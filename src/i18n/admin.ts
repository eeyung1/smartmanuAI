export const adminChinese: Record<string, string> = {
  "Archive closed or rejected records on this page":
    "批量归档本页已关闭或已拒绝的记录",
  "Choose up to 25 records and provide one audit note. Each record commits separately; the batch can partially complete. Published and draft records cannot be archived here.":
    "最多选择 25 条记录并填写一份审核说明。每条记录分别提交，批次可能部分完成。此处不能归档已发布记录或草稿。",
  "Archive {count} selected records? Each successful archive creates a revision; this batch may partially complete.":
    "归档所选的 {count} 条记录？每次成功归档都会新增修订；此批次可能部分完成。",
  "Records to archive": "待归档记录",
  "Shared archive audit note": "批量归档审核说明",
  "Archive selected records": "归档所选记录",
  "Batch archive results": "批量归档结果",
  "Archived records: {count}": "已归档记录：{count}",
  "Outcome unconfirmed; inspect history before retrying.":
    "结果未确认；请查看历史后再重试。",
  "Not attempted because the batch stopped.": "批次已停止，尚未尝试。",
  "Skipped: the revision changed.": "已跳过：修订版本已变化。",
  "Skipped: the record was not found.": "已跳过：未找到记录。",
  "Skipped: only closed or rejected records can be archived.":
    "已跳过：只能归档已关闭或已拒绝的记录。",
  "Skipped: administrator access is no longer available.":
    "已跳过：管理员权限已不可用。",
  "Unable to confirm the batch outcome. Reload and inspect revision history before retrying.":
    "无法确认批次结果。请重新加载并查看修订历史后再重试。",
  "Reload for current states and revisions before another batch. Successful archives are not rolled back when another record is skipped.":
    "下一批操作前请重新加载以获取当前状态和版本。其他记录被跳过时，已成功的归档不会回滚。",
  "Reload catalogue": "重新加载目录",
  "Operations overview": "运营概览",
  "Read-only snapshot of retained records. Job and candidate states are not attempt counts, source coverage or publication-success measurements.":
    "保留记录的只读快照。任务和候选状态不等于尝试次数、来源覆盖率或发布成功率。",
  "Snapshot time": "快照时间",
  "Collection queue": "采集队列",
  "Review candidates": "审核候选记录",
  "Total stored candidates": "已存储候选记录总数",
  "Source policies": "来源策略",
  "Enabled source policies": "已启用的来源策略",
  "Paused or unconfigured sources": "已暂停或未配置的来源",
  "Sources awaiting operator review": "等待管理员复核的来源",
  "Sources with future Retry-After holds": "存在尚未到期重试等待的来源",
  "Review and future-time holds can overlap. Enabling a source policy does not prove permission, availability or complete coverage.":
    "复核等待和时间等待可能重叠。启用来源策略并不证明已获许可、来源可用或覆盖完整。",
  "Research budget reservations": "研究预算预留",
  "Internal budget units equal one million micro-units. Reservations are not settled provider charges, and no currency or invoice total is inferred. This is the existing shared budget, without monthly reset.":
    "一个内部预算单位等于一百万微单位。预留不等于供应商已结算费用，也不推断币种或账单总额。这是现有共享预算，不会按月重置。",
  "Configured budget limit": "已配置预算上限",
  "Shared reserved budget": "共享已预留预算",
  "Unreserved capacity": "尚未预留的额度",
  "Reservations exceed the configured limit.": "预留金额超过已配置上限。",
  "Budget configuration unavailable; no zero balance is assumed.":
    "预算配置不可用；不将其视为零余额。",
  "Stored model-attempt ledger": "已存储模型尝试台账",
  "Total stored model attempts": "已存储模型尝试总数",
  "Reserved attempts": "已预留的尝试",
  "Completed attempts": "已完成的尝试",
  "Uncertain attempts": "状态不确定的尝试",
  "Reservations recorded in model ledger": "模型台账记录的预留",
  "The shared budget can include other local work, so ledger reservations need not equal the shared reserved balance. Uncertain attempts require investigation; this page does not retry or settle them.":
    "共享预算可能包含其他本地任务，因此台账预留不一定等于共享已预留余额。不确定的尝试需要调查；此页面不会重试或结算。",
  "Back to research workspace": "返回研究工作区",
  "Admin catalogue": "管理目录",
  "Counts cover current stored collection-job states across retained history, not attempt totals. Completed includes unchanged checks; active includes queued retries. Cancellations are separate. Collection completion does not confirm opportunity review or publication.":
    "计数反映保留历史中采集任务的当前状态，而非尝试次数。已完成包含内容未变的检查；活动任务包含排队重试。已取消单独统计。采集完成不代表项目已审核或发布。",
  "Collection job counts": "采集任务计数",
  "Total stored jobs": "已存储任务总数",
  "Completed collection jobs": "已完成采集任务",
  "Failed collection jobs": "失败采集任务",
  "Active collection jobs": "活动采集任务",
  "Cancelled collection jobs": "已取消采集任务",
  "Browse this source’s collection jobs": "浏览此来源的采集任务",
  "Source type": "来源类型",
  "Source language": "来源语言",
  University: "大学",
  "Government body": "政府机构",
  "Scholarship body": "奖学金机构",
  "Training provider": "培训机构",
  "Event organizer": "活动主办方",
  "Multiple languages": "多种语言",
  "Source metadata": "来源资料",
  "Save source metadata": "保存来源资料",
  "Operator labels only. Source type does not prove official status, and source language is separate from teaching and notification languages.":
    "仅为管理员标签。来源类型不证明其官方身份，来源语言也不同于授课语言和通知语言。",
  "Source metadata changed. Reload before saving.":
    "来源资料已更改，请重新加载后再保存。",
  "Collection interval (hours)": "采集间隔（小时）",
  "Choose 6–168 hours. Changes apply after the next scheduled check; existing due dates and active jobs stay in place. This interval does not refresh published opportunity verification.":
    "请选择 6 至 168 小时。更改将在下次计划检查后生效；现有到期时间和运行中的任务保持不变。此间隔不会更新已发布项目的核实时间。",
  "Allowed residence country codes, separated by commas":
    "允许的居住国家代码，以逗号分隔",
  "Residence and nationality are separate. Record residence restrictions only when supported by the source; ALL means explicitly unrestricted residence.":
    "居住地与国籍不同。仅记录有来源支持的居住地限制；ALL 表示明确不限居住地。",
  "Retry-After pause requires source-policy review.":
    "Retry-After 暂停需要审核来源策略。",
  "Source retry not before (UTC)": "来源重试不得早于（UTC）",
  "Job available at (UTC)": "任务可执行时间（UTC）",
  "Saving an enabled source policy clears Retry-After pauses after operator review.":
    "操作人员审核后，保存已启用的来源策略将清除 Retry-After 暂停。",

  "Account deletion is pending.": "账户删除正在等待处理。",
  "Collection job not found.": "未找到采集任务。",
  "Collection job changed. Reload before acting.":
    "采集任务已更改。请重新加载后再操作。",
  "Only queued or running collection jobs can be cancelled.":
    "只能取消排队中或运行中的采集任务。",
  "Only failed or cancelled collection jobs can be retried.":
    "只能重试失败或已取消的采集任务。",
  "An enabled, non-synthetic source policy is required to retry collection.":
    "重试采集需要已启用的非模拟来源策略。",
  "This collection job already has a replacement.": "此采集任务已有替代任务。",
  "This source already has an active collection job.":
    "此来源已有活动中的采集任务。",
  "Inspect collection job": "查看采集任务",
  "Back to collection jobs": "返回采集任务列表",
  "Collection job": "采集任务",
  "Previous collection job": "上一个采集任务",
  "Retry requires an enabled, non-synthetic source policy.":
    "重试需要已启用的非模拟来源策略。",
  "Job action history": "任务操作历史",
  "Actions record the administrator and original reason. Provider usage and model reservations are not changed here.":
    "操作会记录管理员及原始原因。此处不会更改服务商用量或模型预算预留。",
  "Replacement queued": "替代任务已排队",
  "Job cancelled": "任务已取消",
  "Open replacement job": "打开替代任务",
  "No manual job actions yet.": "尚无手动任务操作。",
  "Saved. Reloaded job status requested.": "已保存。正在重新加载任务状态。",
  "Cancelling stops this job and discards any late worker result. It does not pause future source schedules.":
    "取消会停止此任务并丢弃工作进程迟到的结果，但不会暂停来源未来的采集计划。",
  "Retry creates one queued replacement and retains the original attempt. Collection requires a separately running worker.":
    "重试会创建一个排队中的替代任务并保留原始尝试。采集需要单独运行的工作进程。",
  "Reason for this job action": "此次任务操作的原因",
  "Cancel collection job": "取消采集任务",
  "Queue replacement job": "排队替代任务",

  "Back to research dashboard": "返回研究控制台",
  "Research catalogue browser": "研究记录浏览器",
  "Research sections": "研究记录分区",
  "Collection jobs": "采集任务",
  "Browse older source policies, jobs and candidates. Opening a record does not collect a source or run a model.":
    "浏览更早的来源策略、任务和候选记录。打开记录不会采集来源或运行模型。",
  "Search source name or identifier": "搜索来源名称或标识符",
  "Research state": "研究记录状态",
  "All research states": "所有研究记录状态",
  "Source identifier": "来源标识符",
  "Manage source policy": "管理来源策略",
  "View source jobs": "查看来源任务",
  "View source candidates": "查看来源候选记录",
  "Attempts: {count}": "尝试次数：{count}",
  "Inspect candidate": "查看候选记录",
  "No research records match these filters.": "没有符合筛选条件的研究记录。",
  "Research catalogue pages": "研究记录分页",
  "Browse all research records": "浏览所有研究记录",
  "Admin catalogue browser": "管理目录浏览器",
  "Catalogue sections": "目录分区",
  "Opportunity records": "学习机会记录",
  "Source registry": "来源登记表",
  "Find older records or sources beyond the review queue's latest 100 entries. Search does not change publication or collection settings.":
    "查找审核队列最近 100 条之外的旧记录或来源。搜索不会更改发布或采集设置。",
  "Search catalogue records": "搜索目录记录",
  "Record state": "记录状态",
  "All record states": "所有记录状态",
  Archived: "已归档",
  "Create draft from this source": "使用此来源创建草稿",
  "Open record editor": "打开记录编辑器",
  "No admin catalogue records match these filters.":
    "没有符合筛选条件的管理目录记录。",
  "Admin catalogue pages": "管理目录分页",
  "This is a live list; edits may change its ordering. Refresh or return to page one to see the latest records.":
    "此列表实时更新，修改可能改变排序。请刷新或返回第一页查看最新记录。",
  "Browse all records and sources": "浏览所有记录和来源",
  "Back to review queue": "返回审核队列",
  "Revision audit history": "版本审核历史",
  "Current revision: {revision}": "当前版本：{revision}",
  "Source (current registry)": "来源（当前登记信息）",
  "Read-only history. Source wording and reviewer notes are shown unchanged. Times below are UTC audit timestamps, not source deadlines.":
    "此历史记录仅供查阅，来源原文和审核说明保持不变。下方时间为 UTC 审核时间戳，不是来源截止时间。",
  "Revision {revision}": "版本 {revision}",
  "Recorded at (UTC)": "记录时间（UTC）",
  "Actor identifier": "操作人员标识符",
  "Review reason": "审核理由",
  "Initial stored revision; no earlier snapshot exists.":
    "这是首次保存的版本，无更早的快照。",
  "The preceding revision is unavailable; no change comparison is claimed.":
    "前一版本不可用，因此不显示变更比较。",
  "Changed fields": "已更改的字段",
  Before: "更改前",
  After: "更改后",
  "Field absent from snapshot": "快照中无此字段",
  "No state, detail or evidence fields changed in this revision.":
    "此版本未更改状态、详情或证据字段。",
  "Full stored snapshot": "完整的已保存快照",
  "No revisions before this cursor.": "此位置之前没有版本记录。",
  "Audit history pages": "审核历史分页",
  "Latest revisions": "最新版本",
  "Older revisions": "更早版本",
  "View revision history": "查看版本历史",
  "SOURCE COLLECTION": "来源采集",
  "Evidence before extraction.": "先核实证据，再提取信息。",
  "Enable collection only after checking source ownership and permitted access. Collection runs in a separate worker. No source instructions are executed.":
    "请在核实来源归属和允许的访问方式后，再启用采集。采集由单独的任务执行，不会执行来源文字中的指令。",
  "Opportunity review": "学习机会审核",
  "Registered sources": "已登记的来源",
  "Enable collection": "启用采集",
  "Permission and ownership review note": "访问许可与来源归属审核说明",
  "Save collection policy": "保存采集策略",
  "Register a source in opportunity review first.":
    "请先在学习机会审核页面登记来源。",
  "Recent collection jobs": "最近的采集任务",
  "· Attempt": "· 尝试次数",
  "No collection jobs yet.": "尚无采集任务。",
  "Captured candidates": "已采集的候选记录",
  "Inspect source text and submit a structured extraction for validation. This manual import does not call an AI service. Model execution is a separate, explicitly configured worker action.":
    "请检查来源文字，并提交结构化提取结果以进行验证。此手动导入不会调用 AI 服务。模型执行是另一个需明确配置的任务操作。",
  Candidate: "候选记录",
  "Captured source excerpt": "已采集的来源摘录",
  "Structured extraction JSON": "结构化提取 JSON",
  "Keep JSON field names and enum values unchanged. Source text is evidence, not instructions.":
    "请保留 JSON 字段名和枚举值不变。来源文字是证据，不是要执行的指令。",
  "Validate and create draft": "验证并创建草稿",
  "No source snapshots captured yet.": "尚未采集来源快照。",
  ADMINISTRATION: "管理工具",
  "Review before sharing.": "先审核，再分享。",
  "Check the source and evidence before publishing. Edits return a record to draft until reviewed again.":
    "发布前请核实来源及证据。修改会使记录回到草稿状态，需重新审核后才能发布。",
  "Source collection and candidates": "来源采集与候选记录",
  "Add an official source": "添加官方来源",
  "Source name": "来源名称",
  "Source URL": "来源网址",
  "This is a synthetic local test source": "这是本地模拟测试来源",
  "Register source": "登记来源",
  Source: "来源",
  "Select a registered source": "选择已登记的来源",
  Title: "标题",
  Organizer: "主办方",
  Summary: "简介",
  Course: "课程",
  Event: "活动",
  Scholarship: "奖学金",
  Mode: "参与方式",
  "Country code such as CN or leave blank for online":
    "国家代码（如 CN）；线上项目可留空",
  Yes: "是",
  No: "否",
  "Revise opportunity": "修订学习机会",
  "Create a draft": "创建草稿",
  "Tuition covered": "学费已覆盖",
  "Accommodation covered": "住宿费已覆盖",
  "Living costs covered": "生活费已覆盖",
  "Participation free": "参与免费",
  "Application fee and currency or leave blank if unknown":
    "申请费及币种；未知时请留空",
  "Certificate fee or leave blank if unknown": "证书费；未知时请留空",
  "Travel costs or leave blank if unknown": "差旅费；未知时请留空",
  "Funding duration and renewal conditions": "资助期限及续期条件",
  "Deadline date": "截止日期",
  "Deadline wording copied from source": "从来源复制的截止日期原文",
  Eligibility: "申请条件",
  "Structured eligibility for matching": "用于匹配的结构化申请条件",
  "Enter only requirements supported by the eligibility source excerpt. Blank means unknown. ALL means the source explicitly permits all nationalities.":
    "仅填写申请条件来源摘录所支持的要求。留空表示未知。ALL 表示来源明确允许所有国籍。",
  "Scholarship study level": "奖学金学历层次",
  "Allowed nationality codes, separated by commas":
    "允许的国籍代码（用英文逗号分隔）",
  "Minimum age": "最低年龄",
  "Maximum age": "最高年龄",
  "Minimum qualification": "最低学历",
  "Supporting source excerpts": "支持性来源摘录",
  "Review note": "审核说明",
  "Save draft": "保存草稿",
  "Cancel editing": "取消编辑",
  "Review queue": "审核队列",
  "No draft opportunities yet.": "尚无学习机会草稿。",
  "Funding:": "资助：",
  "· Application fee:": "· 申请费：",
  "Eligibility:": "申请条件：",
  "Study level:": "学历层次：",
  ". Nationalities:": "。国籍：",
  ". Age:": "。年龄：",
  to: "至",
  ". Minimum qualification:": "。最低学历：",
  "Source:": "来源：",
  "Source outside current source page": "来源不在当前来源列表页中",
  "Field evidence": "字段证据",
  "Edit details": "编辑详情",
  Decision: "审核决定",
  "Publish after checking source": "核实来源后发布",
  "Close opportunity": "关闭学习机会",
  "Reject draft": "不通过此草稿",
  "I checked the official source and all field evidence":
    "我已核实官方来源及所有字段证据",
  "Decision reason": "决定理由",
  "Record decision": "记录审核决定",
  "Unknown minimum": "最低值未知",
  "unknown maximum": "最高值未知",
  Deadline: "截止日期",
  "Synthetic source; live collection unavailable.":
    "模拟来源，无法进行真实采集。",
  "Collection enabled": "采集已启用",
  "Collection paused": "采集已暂停",
  " · Draft {id}": " · 草稿 {id}",
  "Unable to save.": "无法保存。",
  "Saved, but refresh failed. Reload this page.":
    "已保存，但刷新失败，请重新加载页面。",
  "Saved for review.": "已保存，等待审核。",
  "Enter valid extraction JSON.": "请输入有效的提取 JSON。",
  "Request failed.": "请求失败。",
  "Could not refresh the review queue.": "无法刷新审核队列。",
  "Source registered.": "来源已登记。",
  "Draft saved for review.": "草稿已保存，等待审核。",
  "Review recorded.": "审核决定已记录。",
  "Collection queued": "采集已排队",
  "Collection running": "正在采集",
  "Collection completed": "采集已完成",
  "Collection failed": "采集失败",
  "Collection cancelled": "采集已取消",
  "Candidate awaiting validation": "候选记录等待验证",
  "Candidate drafted": "候选记录已生成草稿",
  "Candidate rejected": "候选记录已被拒绝",
  "This record changed. Reload before reviewing.":
    "此记录已更改，请重新加载后再审核。",
  "Synthetic sources cannot be collected live.": "模拟来源不能用于真实采集。",
  "Administrator access required.": "需要管理员权限。",
  "Unknown source.": "未知来源。",
  "Source not found.": "未找到来源。",
  "Opportunity not found.": "未找到学习机会。",
  "Opportunity changed. Reload before reviewing.":
    "记录已更改，请重新加载后再审核。",
  "Revise the draft before publishing.": "发布前请先修订草稿。",
  "A revision needs details and evidence.": "修订需要提供详情和证据。",
  "Only published records can be closed. Reject an unpublished draft instead.":
    "仅可关闭已发布记录。未发布草稿请使用不通过操作。",
  "Only closed or rejected records can be archived.":
    "仅可归档已关闭或不通过的记录。",
  "Choose a different surviving opportunity.": "请选择不同的保留记录。",
  "The duplicate is already archived and was not merged into this opportunity.":
    "该重复记录已归档，且未合并至此机会。",
  "An archived opportunity cannot survive a merge.":
    "已归档的机会不能作为合并保留记录。",
  "An opportunity changed. Reload both records before merging.":
    "机会记录已更改。合并前请重新加载两条记录。",
  "Verify the official source and field evidence before publishing.":
    "发布前请核实官方来源及字段证据。",
  "Past or closing-today dates cannot be newly published under the conservative date-only policy.":
    "按保守的仅日期政策，截止日期已过或为今天的记录不能新发布。",
  "Fully funded requires supported tuition, accommodation and living costs.":
    "全额资助必须有证据支持学费、住宿费及生活费的覆盖。",
  "Tuition coverage must be supported.": "学费覆盖必须有证据支持。",
  "Free participation must be supported.": "免费参与必须有证据支持。",
  "Scholarships are restricted to China.": "奖学金范围仅限中国。",
  "Use scholarship funding coverage rather than a participation label.":
    "奖学金请使用资助覆盖标签，而非参与费用标签。",
  "In-person opportunities need a country.": "线下机会必须填写国家。",
  "The current catalogue scope includes in-person opportunities in China only.":
    "当前目录仅包含中国境内的线下机会。",
  "Keep the original source deadline text.": "请保留来源中的截止日期原文。",
  "Evidence is not present in the captured source.":
    "证据引文未出现在已采集的来源中。",
  "Irrelevant sources must not contain opportunity details.":
    "无关来源不得包含学习机会详情。",
  "A relevant extraction needs a title and source evidence.":
    "相关提取必须包含标题及来源证据。",
  "Smart manufacturing relevance is unsupported.":
    "没有证据支持其与智能制造相关。",
  "The title must appear in the captured source.":
    "标题必须出现在已采集的来源中。",
  "Candidate not found.": "未找到候选记录。",
  "Candidate was already reviewed.": "此候选记录已审核。",
  "Candidate already processed.": "此候选记录已处理。",
  "Unknown fields need a reason.": "未知字段需说明原因。",
  "Funding requires a source quotation.": "资助信息需要来源引文支持。",
  "A deadline requires a source quotation.": "截止日期需要来源引文支持。",
  "Research budget exhausted.": "研究预算已用尽。",
  "Extraction exceeds output limit.": "提取结果超过输出限制。",
  "Source exceeds extraction input limit.": "来源内容超过提取输入限制。",
};
export const researchStateLabels: Record<
  "job" | "candidate",
  Record<string, string>
> = {
  job: {
    queued: "Collection queued",
    running: "Collection running",
    done: "Collection completed",
    failed: "Collection failed",
    cancelled: "Collection cancelled",
  },
  candidate: {
    pending: "Candidate awaiting validation",
    drafted: "Candidate drafted",
    rejected: "Candidate rejected",
  },
};
