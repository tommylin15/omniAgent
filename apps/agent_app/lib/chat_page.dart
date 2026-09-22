import 'dart:async';

import 'package:flutter/material.dart';

import 'chat_api.dart';

class ChatPage extends StatefulWidget {
  const ChatPage(this.api, {super.key});
  final ChatApi api;

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  late Future<dynamic> threads = widget.api.get('/v1/threads');
  final input = TextEditingController();
  final modelInput = TextEditingController(text: 'gemini-2.5-flash');
  final events = <String, Map<String, dynamic>>{};
  final seenEvents = <String>{};
  final lockedApprovals = <String>{};
  Timer? poller;
  Map<String, dynamic>? thread;
  String runtime = 'gemini';
  String connection = 'idle';
  String? queuedTurn;
  int cursor = -1;
  bool busy = false;
  bool polling = false;

  @override
  void dispose() {
    poller?.cancel();
    input.dispose();
    modelInput.dispose();
    super.dispose();
  }

  void reloadThreads() =>
      setState(() => threads = widget.api.get('/v1/threads'));

  Future<void> select(Map<String, dynamic> value) async {
    setState(() {
      thread = value;
      events.clear();
      seenEvents.clear();
      lockedApprovals.clear();
      queuedTurn = null;
      cursor = -1;
      connection = 'connecting';
    });
    poller?.cancel();
    await refresh();
    poller = Timer.periodic(const Duration(seconds: 2), (_) => refresh());
  }

  Future<void> createThread() async {
    if (busy || modelInput.text.trim().isEmpty) return;
    setState(() => busy = true);
    try {
      final value = await widget.api.post('/v1/threads', {
        'runtime': runtime,
        'model': modelInput.text.trim(),
        'assistantProfile': 'default',
      });
      if (!mounted) return;
      await select(Map<String, dynamic>.from(value));
      reloadThreads();
    } catch (_) {
      if (mounted) _error('無法建立對話');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> fork() async {
    final id = thread?['thread_id'];
    if (id == null || busy) return;
    setState(() => busy = true);
    try {
      final value = await widget.api.post('/v1/threads/$id/fork', {});
      if (!mounted) return;
      await select(Map<String, dynamic>.from(value));
      reloadThreads();
    } catch (_) {
      if (mounted) _error('無法分支對話');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> refresh() async {
    final id = thread?['thread_id'];
    if (id == null || polling) return;
    polling = true;
    try {
      final rows = await widget.api.events('$id', cursor);
      if (!mounted || thread?['thread_id'] != id) return;
      setState(() {
        for (final row in rows) {
          _merge(row);
        }
        connection = 'connected';
      });
    } catch (_) {
      if (mounted) setState(() => connection = 'disconnected');
    } finally {
      polling = false;
    }
  }

  void _merge(Map<String, dynamic> row) {
    final seq = int.tryParse('${row['seq']}') ?? -1;
    final eventId = '${row['event_id'] ?? seq}';
    if (seenEvents.contains(eventId) || seq <= cursor) return;
    seenEvents.add(eventId);
    cursor = seq;
    final key = row['event_type'] == 'item_upsert'
        ? '${row['item_id'] ?? eventId}'
        : eventId;
    events[key] = {...?events[key], ...row};
    if (row['event_type'] == 'turn_cancelled' ||
        row['event_type'] == 'turn_completed' ||
        row['event_type'] == 'turn_error') {
      queuedTurn = null;
    }
  }

  Future<void> send() async {
    final id = thread?['thread_id'];
    final content = input.text.trim();
    if (id == null || content.isEmpty || busy) return;
    setState(() => busy = true);
    try {
      final value = await widget.api
          .post('/v1/threads/$id/messages', {'content': content});
      if (!mounted) return;
      input.clear();
      setState(() => queuedTurn = '${value['turn']['turn_id']}');
      await refresh();
    } catch (_) {
      if (mounted) _error('訊息送出失敗，請稍後重試');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> cancelQueued() async {
    final id = thread?['thread_id'];
    final turn = queuedTurn;
    if (id == null || turn == null || busy) return;
    setState(() => busy = true);
    try {
      await widget.api.post('/v1/threads/$id/turns/$turn/cancel', {});
      if (mounted) setState(() => queuedTurn = null);
      await refresh();
    } catch (_) {
      if (mounted) _error('只有尚未執行的回合可以取消');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> approval(Map<String, dynamic> event, bool approved) async {
    final payload = Map<String, dynamic>.from(event['payload'] as Map? ?? {});
    final requestId = payload['request_id'] ?? payload['requestId'];
    final digest = payload['params_digest'] ?? payload['paramsDigest'];
    final turnId = event['turn_id'];
    final threadId = thread?['thread_id'];
    if (requestId == null ||
        digest == null ||
        turnId == null ||
        threadId == null ||
        lockedApprovals.contains('$requestId')) {
      return;
    }
    setState(() => lockedApprovals.add('$requestId'));
    try {
      await widget.api.post(
          '/v1/threads/$threadId/turns/$turnId/approvals/$requestId',
          {'approved': approved, 'paramsDigest': digest});
      await refresh();
    } catch (_) {
      if (mounted) {
        setState(() => lockedApprovals.remove('$requestId'));
        _error('核准決策失敗，請重新載入狀態');
      }
    }
  }

  void _error(String message) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(message)));

  void showControls() => showModalBottomSheet<void>(
      context: context,
      builder: (_) => const SafeArea(
              child: Padding(
            padding: EdgeInsets.all(16),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              ListTile(
                  title: Text('工具（MCP）'),
                  subtitle: Text('管理 API 尚未接線；工具事件仍可在對話中檢視')),
              ListTile(
                  title: Text('技能'),
                  subtitle: Text('Skill storage 已建立；管理 API 與歷史資料尚未切換')),
              ListTile(
                  title: Text('資料源'),
                  subtitle: Text('Janus context 僅能經驗證的 bounded API/MCP 選取')),
            ]),
          )));

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, box) {
        final wide = box.maxWidth >= 700;
        return Scaffold(
          appBar: AppBar(title: const Text('omniAgent'), actions: [
            IconButton(
                tooltip: '重新載入事件',
                onPressed: refresh,
                icon: const Icon(Icons.refresh)),
            IconButton(
                tooltip: '工具與技能',
                onPressed: showControls,
                icon: const Icon(Icons.tune)),
          ]),
          drawer: wide ? null : Drawer(child: _threadList()),
          body: wide
              ? Row(children: [
                  SizedBox(width: 240, child: _threadList()),
                  const VerticalDivider(width: 1),
                  Expanded(child: _room()),
                ])
              : _room(),
        );
      });

  Widget _threadList() => Column(children: [
        Padding(
            padding: const EdgeInsets.all(8),
            child: FilledButton.icon(
                onPressed: () => setState(() => thread = null),
                icon: const Icon(Icons.add),
                label: const Text('新對話'))),
        Expanded(
            child: FutureBuilder<dynamic>(
                future: threads,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return const Center(child: Text('對話列表無法載入'));
                  }
                  if (!snapshot.hasData) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  final data = snapshot.data;
                  final rows = data is Map ? data['items'] as List? ?? [] : [];
                  return ListView(children: [
                    for (final raw in rows)
                      ListTile(
                        selected: raw['thread_id'] == thread?['thread_id'],
                        title: Text('${raw['runtime']} · ${raw['model']}'),
                        subtitle: Text('${raw['thread_id']}'),
                        onTap: () {
                          if (Scaffold.of(context).isDrawerOpen) {
                            Navigator.pop(context);
                          }
                          select(Map<String, dynamic>.from(raw));
                        },
                      )
                  ]);
                }))
      ]);

  Widget _room() {
    if (thread == null) {
      return Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                DropdownButtonFormField<String>(
                  initialValue: runtime,
                  decoration: const InputDecoration(labelText: '執行環境'),
                  items: const [
                    DropdownMenuItem(value: 'gemini', child: Text('Gemini')),
                    DropdownMenuItem(
                        value: 'openrouter', child: Text('OpenRouter')),
                    DropdownMenuItem(value: 'codex', child: Text('Codex')),
                  ],
                  onChanged: (value) {
                    if (value == null) return;
                    setState(() {
                      runtime = value;
                      modelInput.text = {
                        'gemini': 'gemini-2.5-flash',
                        'openrouter': 'openai/gpt-4o-mini',
                        'codex': 'gpt-5'
                      }[value]!;
                    });
                  },
                ),
                TextField(
                    controller: modelInput,
                    decoration: const InputDecoration(labelText: '模型')),
                const SizedBox(height: 12),
                FilledButton(
                    onPressed: busy ? null : createThread,
                    child: const Text('建立對話')),
              ])));
    }
    final ordered = events.values.toList()
      ..sort((a, b) => (int.tryParse('${a['seq']}') ?? 0)
          .compareTo(int.tryParse('${b['seq']}') ?? 0));
    return Column(children: [
      ListTile(
        title: Text('${thread!['runtime']} · ${thread!['model']}'),
        subtitle: Text(
            connection == 'disconnected' ? '連線中斷，請重新載入事件' : '事件游標 $cursor'),
        trailing: IconButton(
            tooltip: '分支對話',
            onPressed: busy ? null : fork,
            icon: const Icon(Icons.call_split)),
      ),
      Expanded(
          child: ordered.isEmpty
              ? const Center(child: Text('開始輸入訊息'))
              : ListView(padding: const EdgeInsets.all(12), children: [
                  for (final event in ordered)
                    _EventCard(event, approval, lockedApprovals)
                ])),
      if (queuedTurn != null)
        ListTile(
            title: const Text('訊息已排隊，等待執行環境接手'),
            trailing: TextButton(
                onPressed: busy ? null : cancelQueued,
                child: const Text('取消排隊'))),
      SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Expanded(
                  child: TextField(
                      controller: input,
                      minLines: 1,
                      maxLines: 5,
                      onSubmitted: (_) => send(),
                      decoration: const InputDecoration(
                          hintText: '輸入訊息…', border: OutlineInputBorder()))),
              IconButton(
                  tooltip: '送出',
                  onPressed: busy ? null : send,
                  icon: const Icon(Icons.send)),
            ]),
          )),
    ]);
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard(this.event, this.onApproval, this.locked);
  final Map<String, dynamic> event;
  final Future<void> Function(Map<String, dynamic>, bool) onApproval;
  final Set<String> locked;

  @override
  Widget build(BuildContext context) {
    final type = '${event['event_type']}';
    final payload = Map<String, dynamic>.from(event['payload'] as Map? ?? {});
    if (type == 'approval_request') {
      final id = '${payload['request_id'] ?? payload['requestId'] ?? ''}';
      return Card(
          child: ListTile(
        title: const Text('需要核准的操作'),
        subtitle: Text('操作：${payload['operation'] ?? '未提供'}\n'
            '參數摘要：${payload['params_digest'] ?? payload['paramsDigest'] ?? '未提供'}\n'
            '到期：${payload['expires_at'] ?? payload['expiresAt'] ?? '未提供'}'),
        trailing: Wrap(children: [
          TextButton(
              onPressed:
                  locked.contains(id) ? null : () => onApproval(event, false),
              child: const Text('拒絕')),
          FilledButton(
              onPressed:
                  locked.contains(id) ? null : () => onApproval(event, true),
              child: const Text('允許')),
        ]),
      ));
    }
    if (type == 'tool_request' || type == 'tool_result') {
      return ListTile(
          leading: const Icon(Icons.build_outlined),
          title: Text(type == 'tool_request' ? '工具呼叫' : '工具結果'),
          subtitle: Text('${payload['tool'] ?? payload['name'] ?? '未提供'}'));
    }
    if (type == 'citation') {
      return ListTile(
          leading: const Icon(Icons.link),
          title: const Text('引用來源'),
          subtitle: Text('${payload['source'] ?? payload['url'] ?? '未提供'}'));
    }
    if (type == 'usage') {
      return ListTile(
          title: const Text('用量'),
          subtitle: Text('${payload['total_tokens'] ?? '未提供'}'));
    }
    if (type.startsWith('turn_') || type == 'approval_resolved') {
      return ListTile(
          title: Text({
                'turn_completed': '已完成',
                'turn_cancelled': '已取消',
                'turn_error': '執行失敗',
                'approval_resolved': '核准狀態已更新'
              }[type] ??
              type));
    }
    final content =
        '${payload['content'] ?? payload['text'] ?? payload['message'] ?? ''}';
    return Align(
        alignment: payload['role'] == 'user'
            ? Alignment.centerRight
            : Alignment.centerLeft,
        child: Card(
            child: Padding(
                padding: const EdgeInsets.all(12),
                child: MarkdownText(content))));
  }
}

class MarkdownText extends StatelessWidget {
  const MarkdownText(this.value, {super.key});
  final String value;

  @override
  Widget build(BuildContext context) {
    var code = false;
    final children = <Widget>[];
    for (final line in value.split('\n')) {
      if (line.startsWith('```')) {
        code = !code;
        continue;
      }
      children.add(Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: line.startsWith('# ')
              ? Text(line.substring(2),
                  style: Theme.of(context).textTheme.titleLarge)
              : code
                  ? SelectableText(line,
                      style: const TextStyle(fontFamily: 'monospace'))
                  : SelectableText(line)));
    }
    return Column(
        crossAxisAlignment: CrossAxisAlignment.start, children: children);
  }
}
