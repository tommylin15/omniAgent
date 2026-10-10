import 'dart:async';

import 'package:flutter/material.dart';

import 'chat_api.dart';
import 'model_catalog.dart';
import 'omni_theme.dart';
import 'twin_beast_mascot.dart';

class ChatPage extends StatefulWidget {
  const ChatPage(this.api, {super.key});
  final ChatApi api;

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  late Future<dynamic> threads = widget.api.get('/v1/threads');
  final input = TextEditingController();
  final modelInput = TextEditingController(text: 'gemini-3.5-flash-lite');
  final events = <String, Map<String, dynamic>>{};
  final seenEvents = <String>{};
  final lockedApprovals = <String>{};
  Timer? poller;
  Map<String, dynamic>? thread;
  String runtime = 'gemini';
  String connection = 'idle';
  String? queuedTurn;
  String turnPhase = 'queued';
  int cursor = -1;
  bool busy = false;
  int selectionEpoch = 0;
  int? pollingEpoch;
  Map<String, List<String>>? entitledModels;

  @override
  void initState() {
    super.initState();
    unawaited(loadOwnerModels());
  }

  Future<void> loadOwnerModels() async {
    try {
      final raw = await widget.api.get('/v1/models');
      if (!mounted || raw is! Map || raw['dispatchEnabled'] is! bool) return;
      final allowed = <String, List<String>>{};
      if (raw['dispatchEnabled'] == true && raw['items'] is List) {
        for (final entry in raw['items'] as List) {
          if (entry is! Map) continue;
          final mode = entry['runtime'];
          final name = entry['model'];
          if (mode is String && name is String && modelCatalog.containsKey(mode) &&
              mode != 'groq' && name.isNotEmpty &&
              (mode != 'gemini' || modelCatalog['gemini']!.contains(name))) {
            allowed.putIfAbsent(mode, () => <String>[]).add(name);
          }
        }
      }
      for (final entries in allowed.values) { entries.sort(); }
      setState(() {
        entitledModels = allowed;
        if (allowed.isNotEmpty && !allowed.containsKey(runtime)) {
          runtime = allowed.keys.first;
          modelInput.text = allowed[runtime]!.first;
        } else if (allowed.containsKey(runtime) &&
            !allowed[runtime]!.contains(modelInput.text)) {
          modelInput.text = allowed[runtime]!.first;
        }
      });
    } catch (_) {
      // A failed capability lookup must not grant model execution.
      if (mounted) setState(() => entitledModels = <String, List<String>>{});
    }
  }

  bool get modelAllowed {
    final selected = modelInput.text.trim();
    if (runtime == 'gemini' && !modelCatalog['gemini']!.contains(selected)) {
      return false;
    }
    return entitledModels == null ||
        (entitledModels![runtime]?.contains(selected) ?? false);
  }
  List<String> get selectableModels => entitledModels == null
      ? modelCatalog[runtime]! : entitledModels![runtime] ?? <String>[];

  @override
  void dispose() {
    poller?.cancel();
    input.dispose();
    modelInput.dispose();
    super.dispose();
  }

  void reloadThreads() =>
      setState(() => threads = widget.api.get('/v1/threads'));

  void clearSelection() {
    poller?.cancel();
    selectionEpoch++;
    pollingEpoch = null;
    setState(() {
      thread = null;
      events.clear();
      seenEvents.clear();
      lockedApprovals.clear();
      queuedTurn = null;
      turnPhase = 'queued';
      cursor = -1;
      connection = 'idle';
    });
  }

  Future<void> select(Map<String, dynamic> value) async {
    poller?.cancel();
    final epoch = ++selectionEpoch;
    setState(() {
      thread = value;
      events.clear();
      seenEvents.clear();
      lockedApprovals.clear();
      queuedTurn = null;
      turnPhase = 'queued';
      cursor = -1;
      connection = 'connecting';
    });
    await refresh();
    // Never re-enable a poller for a thread that was switched or deleted
    // while its initial SSE replay request was still in flight.
    if (!mounted || selectionEpoch != epoch ||
        thread?['thread_id'] != value['thread_id']) {
      return;
    }
    poller = Timer.periodic(const Duration(seconds: 2), (_) => refresh());
  }

  Future<void> createThread() async {
    if (busy || runtime == 'groq' || !modelAllowed || modelInput.text.trim().isEmpty) return;
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

  Future<void> deleteThread(Map<String, dynamic> value) async {
    if (busy) return;
    final confirmed = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: const Text('永久刪除對話？'),
      content: const Text('此對話的訊息與歷史紀錄將永久刪除，無法復原。已有分支會保留。'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('取消')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('永久刪除')),
      ],
    ));
    if (confirmed != true || !mounted) return;
    setState(() => busy = true);
    try {
      await widget.api.delete('/v1/threads/${value['thread_id']}');
      if (!mounted) return;
      if (thread?['thread_id'] == value['thread_id']) {
        clearSelection();
      }
      reloadThreads();
    } catch (_) {
      if (mounted) _error('無法刪除對話；請確認回合已停止後重試');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> refresh() async {
    final id = thread?['thread_id'];
    final epoch = selectionEpoch;
    if (id == null || pollingEpoch == epoch) return;
    // Each selected thread gets its own in-flight slot. A delayed request
    // from an older thread cannot prevent the new thread's initial replay.
    pollingEpoch = epoch;
    try {
      final currentTurn = queuedTurn;
      if (currentTurn != null && turnPhase == 'running') {
        final result = await widget.api.post(
            '/v1/threads/$id/turns/$currentTurn/refresh', {});
        if (!mounted || selectionEpoch != epoch || thread?['thread_id'] != id) return;
        if (result is Map && result['status'] is String) {
          setState(() => turnPhase = result['status'] as String);
        }
      }
      final rows = await widget.api.events('$id', cursor);
      if (!mounted || selectionEpoch != epoch ||
          thread?['thread_id'] != id) {
        return;
      }
      setState(() {
        for (final row in rows) {
          _merge(row);
        }
        connection = 'connected';
      });
    } catch (_) {
      if (mounted && selectionEpoch == epoch &&
          thread?['thread_id'] == id) {
        setState(() => connection = 'disconnected');
      }
    } finally {
      if (pollingEpoch == epoch) {
        pollingEpoch = null;
      }
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
    if (row['event_type'] == 'approval_request') {
      turnPhase = 'approval_required';
    }
    if (row['event_type'] == 'turn_cancelled' ||
        row['event_type'] == 'turn_completed' ||
        row['event_type'] == 'turn_error') {
      queuedTurn = null;
      turnPhase = 'queued';
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
      final phase = value['dispatch'] is Map
          ? '${value['dispatch']['status']}' : 'queued';
      setState(() {
        turnPhase = phase;
        queuedTurn = ['completed','cancelled','error'].contains(phase)
            ? null : '${value['turn']['turn_id']}';
      });
      await refresh();
    } catch (error) {
      if (mounted) _error(error is StateError ? error.message.toString() : '訊息送出失敗，請稍後重試');
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
      final result = await widget.api.post('/v1/threads/$id/turns/$turn/cancel', {});
      if (mounted) setState(() {
        if (result is Map && ['CANCELLED','cancelled','completed','error']
            .contains(result['status'])) {
          queuedTurn = null;
          turnPhase = 'queued';
        } else if (result is Map && result['status'] is String) {
          turnPhase = result['status'] as String;
        }
      });
      await refresh();
    } catch (_) {
      if (mounted) _error('目前無法取消；執行狀態可能已變更，請重新整理');
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
      final result = await widget.api.post(
          '/v1/threads/$threadId/turns/$turnId/approvals/$requestId',
          {'approved': approved, 'paramsDigest': digest});
      if (mounted && result is Map && result['status'] is String) {
        setState(() => turnPhase = result['status'] as String);
      }
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
        backgroundColor: OmniColors.softSurface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        builder: (_) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: OmniColors.milkTea,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  '工具與能力',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 4),
                const Text('只呈現已接線或已知的真實狀態，不建立假的操作入口。'),
                const SizedBox(height: 12),
                const ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.build_outlined),
                  title: Text('工具（MCP）'),
                  subtitle: Text('管理 API 尚未接線；工具事件仍可在對話中檢視'),
                ),
                const ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.auto_awesome_outlined),
                  title: Text('技能'),
                  subtitle: Text('Skill storage 已建立；管理 API 與歷史資料尚未切換'),
                ),
                const ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.storage_outlined),
                  title: Text('資料源'),
                  subtitle: Text('外部資料來源僅能經 omniAgent 驗證的 Tool/MCP/Data Source contract 選取'),
                ),
              ],
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, box) {
        final wide = box.maxWidth >= 700;
        return Scaffold(
          appBar: AppBar(
            title: const Text('omniAgent'),
            actions: [
              IconButton(
                tooltip: '重新載入事件',
                onPressed: refresh,
                icon: const Icon(Icons.refresh_rounded),
              ),
              IconButton(
                tooltip: '工具與技能',
                onPressed: showControls,
                icon: const Icon(Icons.tune_rounded),
              ),
              const SizedBox(width: 4),
            ],
          ),
          drawer: wide
              ? null
              : Drawer(
                  backgroundColor: OmniColors.softSurface,
                  child: _threadList(),
                ),
          body: wide
              ? Row(
                  children: [
                    Container(
                      width: 272,
                      decoration: const BoxDecoration(
                        color: OmniColors.softSurface,
                        border: Border(
                          right: BorderSide(color: OmniColors.milkTea),
                        ),
                      ),
                      child: _threadList(),
                    ),
                    Expanded(child: _room()),
                  ],
                )
              : _room(),
        );
      });

  Widget _threadList() => SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
              child: FilledButton.icon(
                onPressed: clearSelection,
                icon: const Icon(Icons.add_rounded),
                label: const Text('新對話'),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 4, 18, 8),
              child: Text(
                '對話',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: OmniColors.mutedCocoa,
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ),
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
                  if (rows.isEmpty) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          '還沒有對話，從上方建立第一個吧。',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    );
                  }
                  return ListView(
                    padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
                    children: [
                      for (final raw in rows)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Material(
                            color: raw['thread_id'] == thread?['thread_id']
                                ? const Color(0xFFFFE8DD)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(16),
                            child: ListTile(
                              selected:
                                  raw['thread_id'] == thread?['thread_id'],
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                              leading: const Icon(Icons.chat_bubble_outline),
                              trailing: IconButton(tooltip: '刪除對話', icon: const Icon(Icons.delete_outline),
                                onPressed: busy ? null : () => deleteThread(Map<String, dynamic>.from(raw))),
                              title:
                                  Text('${raw['runtime']} · ${raw['model']}'),
                              subtitle: Text(
                                '${raw['thread_id']}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              onTap: () {
                                if (Scaffold.of(context).isDrawerOpen) {
                                  Navigator.pop(context);
                                }
                                select(Map<String, dynamic>.from(raw));
                              },
                            ),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      );

  Widget _connectionStatus() {
    IconData icon;
    String label;
    Color background;
    Color foreground;

    switch (connection) {
      case 'disconnected':
        icon = Icons.cloud_off_outlined;
        label = '連線中斷，請重新載入事件';
        background = Theme.of(context).colorScheme.errorContainer;
        foreground = Theme.of(context).colorScheme.onErrorContainer;
        break;
      case 'connecting':
        icon = Icons.sync_rounded;
        label = '正在同步事件';
        background = const Color(0xFFFFF0E8);
        foreground = OmniColors.cocoa;
        break;
      case 'connected':
        icon = Icons.check_circle_outline_rounded;
        label = '事件已同步 · 游標 $cursor';
        background = const Color(0xFFEAF2E7);
        foreground = OmniColors.cocoa;
        break;
      default:
        icon = Icons.circle_outlined;
        label = '尚未同步事件';
        background = const Color(0xFFF3EEE8);
        foreground = OmniColors.mutedCocoa;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: foreground),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: foreground,
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _room() {
    if (thread == null) {
      return SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Card(
                margin: EdgeInsets.zero,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                  side: BorderSide(color: Theme.of(context).dividerColor),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Center(child: TwinBeastMascotSlot(size: 96)),
                      const SizedBox(height: 18),
                      Text(
                        '今天想一起完成什麼？',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '選擇執行環境與模型，建立後這個對話會沿用這組設定。',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 24),
                      DropdownButtonFormField<String>(
                        initialValue: runtime,
                        decoration: const InputDecoration(labelText: '執行環境'),
                        items: const [
                          DropdownMenuItem(
                              value: 'gemini', child: Text('Gemini')),
                          DropdownMenuItem(
                              value: 'openrouter', child: Text('OpenRouter')),
                          DropdownMenuItem(
                              value: 'codex', child: Text('Codex')),
                          DropdownMenuItem(
                              value: 'groq', child: Text('Groq（型號預覽）')),
                        ],
                        onChanged: (value) {
                          if (value == null) return;
                          setState(() {
                            runtime = value;
                            final models = entitledModels == null
                                ? modelCatalog[value]! : entitledModels![value] ?? <String>[];
                            modelInput.text = models.isEmpty ? '' : models.first;
                          });
                        },
                      ),
                      const SizedBox(height: 14),
                      DropdownMenu<String>(
                        key: ValueKey(runtime),
                        controller: modelInput,
                        enableFilter: true,
                        requestFocusOnTap: true,
                        expandedInsets: EdgeInsets.zero,
                        menuHeight: 240,
                        label: const Text('模型（可搜尋或手填）'),
                        dropdownMenuEntries: [
                          for (final model in selectableModels)
                            DropdownMenuEntry(value: model, label: model),
                        ],
                      ),
                      if (entitledModels != null && !modelAllowed)
                         const Padding(
                           padding: EdgeInsets.only(top: 8),
                           child: Text('此帳號尚未取得所選模型的執行權限；不會送出付費推論。'),
                         ),
                       if (runtime == 'groq')
                        const Padding(
                          padding: EdgeInsets.only(top: 8),
                          child: Text('Groq 尚未接通，目前僅提供型號預覽。'),
                        ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed:
                            busy || runtime == 'groq' || !modelAllowed ? null : createThread,
                        child: const Text('建立對話'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }
    final ordered = events.values.toList()
      ..sort((a, b) => (int.tryParse('${a['seq']}') ?? 0)
          .compareTo(int.tryParse('${b['seq']}') ?? 0));
    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(18, 12, 10, 12),
          decoration: const BoxDecoration(
            color: OmniColors.softSurface,
            border: Border(
              bottom: BorderSide(color: OmniColors.milkTea),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${thread!['runtime']} · ${thread!['model']}',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: 7),
                    _connectionStatus(),
                  ],
                ),
              ),
              IconButton(
                tooltip: '分支對話',
                onPressed: busy ? null : fork,
                icon: const Icon(Icons.call_split_rounded),
              ),
            ],
          ),
        ),
        Expanded(
          child: ordered.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.chat_bubble_outline_rounded,
                          size: 34,
                          color: OmniColors.mutedCocoa,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          '開始輸入訊息',
                          style:
                              Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          '訊息、工具事件與執行結果會依實際狀態出現在這裡。',
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
                  children: [
                    for (final event in ordered)
                      _EventCard(event, approval, lockedApprovals),
                  ],
                ),
        ),
        if (queuedTurn != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: Container(
              padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF0E8),
                border: Border.all(color: OmniColors.milkTea),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Icon(Icons.schedule_rounded, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(turnPhase == 'approval_required'
                         ? '正在等待核准決策'
                         : turnPhase == 'running'
                             ? '模型正在執行，可嘗試中斷'
                             : '訊息已排隊，等待執行環境接手'),
                  ),
                  TextButton(
                    onPressed: busy ? null : cancelQueued,
                    child: Text(turnPhase == 'running' || turnPhase == 'approval_required'
                        ? '中斷執行' : '取消排隊'),
                  ),
                ],
              ),
            ),
          ),
        SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            decoration: const BoxDecoration(
              color: OmniColors.softSurface,
              border: Border(
                top: BorderSide(color: OmniColors.milkTea),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: input,
                    minLines: 1,
                    maxLines: 5,
                    onSubmitted: (_) => send(),
                    decoration: const InputDecoration(
                      hintText: '輸入訊息…',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                DecoratedBox(
                  decoration: BoxDecoration(
                    color:
                        busy ? OmniColors.milkTea : OmniColors.apricot,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: IconButton(
                    tooltip: '送出',
                    onPressed: busy ? null : send,
                    icon: const Icon(Icons.send_rounded),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
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

    Widget compactEvent(
      IconData icon,
      String title,
      String subtitle, {
      bool error = false,
    }) =>
        Container(
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: error
                ? Theme.of(context).colorScheme.errorContainer
                : OmniColors.softSurface,
            border: Border.all(
              color: error
                  ? Theme.of(context).colorScheme.error
                  : OmniColors.milkTea,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: ListTile(
            dense: true,
            leading: Icon(
              icon,
              color: error
                  ? Theme.of(context).colorScheme.onErrorContainer
                  : OmniColors.mutedCocoa,
            ),
            title: Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: subtitle.isEmpty ? null : Text(subtitle),
          ),
        );

    if (type == 'approval_request') {
      final id = '${payload['request_id'] ?? payload['requestId'] ?? ''}';
      final isLocked = locked.contains(id);
      return Card(
        margin: const EdgeInsets.only(bottom: 12),
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: OmniColors.milkTea),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Icon(Icons.verified_user_outlined),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '需要核准的操作',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ),
                  if (isLocked)
                    const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.lock_clock_outlined, size: 18),
                        SizedBox(width: 4),
                        Text('處理中'),
                      ],
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Text('操作：${payload['operation'] ?? '未提供'}'),
              const SizedBox(height: 4),
              Text(
                '參數摘要：${payload['params_digest'] ?? payload['paramsDigest'] ?? '未提供'}',
              ),
              const SizedBox(height: 4),
              Text(
                '到期：${payload['expires_at'] ?? payload['expiresAt'] ?? '未提供'}',
              ),
              const SizedBox(height: 14),
              Wrap(
                alignment: WrapAlignment.end,
                spacing: 8,
                runSpacing: 8,
                children: [
                  TextButton(
                    onPressed:
                        isLocked ? null : () => onApproval(event, false),
                    child: const Text('拒絕'),
                  ),
                  FilledButton(
                    onPressed:
                        isLocked ? null : () => onApproval(event, true),
                    child: const Text('允許'),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    }
    if (type == 'tool_request' || type == 'tool_result') {
      return compactEvent(
        Icons.build_outlined,
        type == 'tool_request' ? '工具呼叫' : '工具結果',
        '${payload['tool'] ?? payload['name'] ?? '未提供'}',
      );
    }
    if (type == 'citation') {
      return compactEvent(
        Icons.link_rounded,
        '引用來源',
        '${payload['source'] ?? payload['url'] ?? '未提供'}',
      );
    }
    if (type == 'usage') {
      return compactEvent(
        Icons.data_usage_rounded,
        '用量',
        '${payload['total_tokens'] ?? '未提供'}',
      );
    }
    if (type.startsWith('turn_') || type == 'approval_resolved') {
      final title = {
            'turn_completed': '已完成',
            'turn_cancelled': '已取消',
            'turn_error': '執行失敗',
            'approval_resolved': '核准狀態已更新'
          }[type] ??
          type;
      return compactEvent(
        type == 'turn_error'
            ? Icons.error_outline_rounded
            : Icons.check_circle_outline_rounded,
        title,
        '',
        error: type == 'turn_error',
      );
    }

    final content =
        '${payload['content'] ?? payload['text'] ?? payload['message'] ?? ''}';
    final isUser = payload['role'] == 'user';
    final role = payload['role'] == 'assistant'
        ? 'omniAgent'
        : isUser
            ? '你'
            : null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Align(
        alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: isUser
                  ? const Color(0xFFFFE9DE)
                  : OmniColors.softSurface,
              border: Border.all(color: OmniColors.milkTea),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (role != null) ...[
                    Text(
                      role,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                            color: OmniColors.mutedCocoa,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: 6),
                  ],
                  MarkdownText(content),
                ],
              ),
            ),
          ),
        ),
      ),
    );
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
