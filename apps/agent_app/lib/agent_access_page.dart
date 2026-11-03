import 'package:flutter/material.dart';
import 'chat_api.dart';

class _ModelDraft {
  _ModelDraft(Map value)
      : runtime = value['runtime'] as String,
        model = value['model'] as String,
        profile = value['routeProfile'] as String? ?? 'public-lite' {
    if (!['gemini', 'openrouter', 'groq', 'codex'].contains(runtime) ||
        !['public-lite', 'private-lite', 'advanced-flash'].contains(profile) ||
        runtime != 'gemini' && profile != 'public-lite') {
      throw const FormatException('invalid model draft');
    }
  }
  String runtime, model, profile;
  Map<String, String> toJson() => {
    'runtime': runtime, 'model': model,
    if (runtime == 'gemini' && profile != 'public-lite') 'routeProfile': profile,
  };
}

class _OwnerDraft {
  _OwnerDraft(Map value)
      : ownerId = value['ownerId'] as String,
        models = (value['models'] as List).map((m) => _ModelDraft(m as Map)).toList(),
        tools = (value['tools'] as List).cast<String>().toList();
  String ownerId;
  final List<_ModelDraft> models;
  final List<String> tools;
  final toolInput = TextEditingController();
  Map<String, dynamic> toJson() => {
    'ownerId': ownerId.trim(), 'models': models.map((m) => m.toJson()).toList(),
    'tools': tools.toList(),
  };
}

/// Versioned draft only. OAuth Admin authorization is enforced by the API.
class AgentAccessPage extends StatefulWidget {
  const AgentAccessPage(this.api, {super.key});
  final ChatApi api;
  @override
  State<AgentAccessPage> createState() => _AgentAccessPageState();
}

class _AgentAccessPageState extends State<AgentAccessPage> {
  final form = GlobalKey<FormState>();
  List<_OwnerDraft> owners = [];
  int version = 0;
  bool loading = true, saving = false;
  String? error;
  bool loaded = false;
  static final uuid = RegExp(r'^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$');
  static final toolName = RegExp(r'^[a-z][a-z0-9_.-]{1,127}$');

  @override
  void initState() { super.initState(); load(); }
  @override
  void dispose() {
    for (final owner in owners) { owner.toolInput.dispose(); }
    super.dispose();
  }

  void accept(dynamic value) {
    if (value is! Map || value['version'] is! int || value['owners'] is! List) {
      throw const FormatException('invalid access draft');
    }
    final next = (value['owners'] as List).map((o) => _OwnerDraft(o as Map)).toList();
    if (next.length > 100 || (value['version'] as int) < 0) {
      for (final owner in next) { owner.toolInput.dispose(); }
      throw const FormatException('invalid access draft');
    }
    for (final owner in owners) { owner.toolInput.dispose(); }
    owners = next;
    version = value['version'] as int;
    loaded = true;
  }

  Future<void> load() async {
    if (loading && loaded || saving) return;
    setState(() { loading = true; error = null; });
    try {
      final value = await widget.api.get('/v1/admin/agent-access');
      if (!mounted) return;
      accept(value);
    } catch (_) {
      if (mounted) error = '無法讀取授權草稿，請確認 Admin 權限、服務開關與資料庫。';
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> save() async {
    if (saving || !loaded || !(form.currentState?.validate() ?? false)) return;
    final ids = owners.map((o) => o.ownerId.trim().toLowerCase()).toSet();
    if (ids.length != owners.length || owners.any((o) => o.toolInput.text.trim().isNotEmpty)) {
      setState(() => error = 'Owner 不可重複；請先加入或清空尚未送出的工具名稱。');
      return;
    }
    setState(() { saving = true; error = null; });
    try {
      final value = await widget.api.put('/v1/admin/agent-access', {
        'expectedVersion': version, 'owners': owners.map((o) => o.toJson()).toList(),
      });
      if (!mounted) return;
      accept(value);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('授權草稿已儲存並讀回，尚未生效')));
    } catch (_) {
      if (mounted) error = '儲存失敗：版本可能已更新，或欄位／權限不符。草稿保留，請核對後重新讀取。';
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  void addTool(_OwnerDraft owner) {
    final name = owner.toolInput.text.trim();
    if (!toolName.hasMatch(name) || owner.tools.contains(name) || owner.tools.length >= 128) {
      setState(() => error = '工具名稱格式錯誤、重複或超過 128 個。'); return;
    }
    setState(() { owner.tools.add(name); owner.toolInput.clear(); error = null; });
  }

  Widget modelField(_OwnerDraft owner, _ModelDraft model) => Padding(
    key: ObjectKey(model), padding: const EdgeInsets.symmetric(vertical: 8),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Wrap(spacing: 12, runSpacing: 12, children: [
        SizedBox(width: 180, child: DropdownButtonFormField<String>(
          initialValue: model.runtime, decoration: const InputDecoration(labelText: '執行環境'),
          items: [for (final runtime in ['gemini', 'openrouter', 'groq', 'codex'])
            DropdownMenuItem(value: runtime, child: Text(runtime))],
          onChanged: saving ? null : (value) => setState(() {
            model.runtime = value!;
            if (value != 'gemini') model.profile = 'public-lite';
          }),
        )),
        SizedBox(width: 300, child: TextFormField(
          initialValue: model.model, enabled: !saving, maxLength: 257,
          decoration: const InputDecoration(labelText: '模型 ID'),
          onChanged: (v) => model.model = v.trim(),
          validator: (_) {
            if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:/-]{0,256}$').hasMatch(model.model)) {
              return '請輸入模型 ID';
            }
            if (model.runtime == 'openrouter' && model.model != 'openrouter/free' && !model.model.endsWith(':free')) {
              return 'OpenRouter 草稿僅允許免費模型';
            }
            return null;
          },
        )),
        if (model.runtime == 'gemini') SizedBox(width: 220, child: DropdownButtonFormField<String>(
          initialValue: model.profile, decoration: const InputDecoration(labelText: 'Gemini 路由草稿'),
          items: const [
            DropdownMenuItem(value: 'public-lite', child: Text('公開 Lite')),
            DropdownMenuItem(value: 'private-lite', child: Text('私人 Paid Lite')),
            DropdownMenuItem(value: 'advanced-flash', child: Text('Paid Flash')),
          ],
          onChanged: saving ? null : (value) => setState(() => model.profile = value!),
        )),
        IconButton(tooltip: '移除模型草稿', onPressed: saving ? null : () => setState(() => owner.models.remove(model)),
          icon: const Icon(Icons.remove_circle_outline)),
      ]),
    ]),
  );

  Widget ownerCard(_OwnerDraft owner) => Card(key: ObjectKey(owner), child: Padding(
    padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [Expanded(child: TextFormField(
        initialValue: owner.ownerId, enabled: !saving, maxLength: 36,
        decoration: const InputDecoration(labelText: 'Owner UUID'),
        onChanged: (v) => owner.ownerId = v,
        validator: (_) => uuid.hasMatch(owner.ownerId.trim()) ? null : '請輸入有效的 Owner UUID',
      )), IconButton(tooltip: '移除 Owner 草稿', onPressed: saving ? null : () => setState(() {
        owners.remove(owner); owner.toolInput.dispose();
      }), icon: const Icon(Icons.person_remove_outlined))]),
      const Text('模型授權草稿'),
      for (final model in owner.models) modelField(owner, model),
      TextButton.icon(onPressed: saving || owner.models.length >= 32 ? null : () => setState(() {
        owner.models.add(_ModelDraft({'runtime': 'gemini', 'model': ''}));
      }), icon: const Icon(Icons.add), label: const Text('新增模型草稿')),
      const SizedBox(height: 12),
      const Text('工具 grant 草稿（必須另有後端 Connector／MCP 授權）'),
      Wrap(spacing: 8, children: [for (final tool in owner.tools)
        InputChip(label: Text(tool), onDeleted: saving ? null : () => setState(() => owner.tools.remove(tool)))]),
      Row(children: [Expanded(child: TextField(
        controller: owner.toolInput, enabled: !saving, maxLength: 128,
        decoration: const InputDecoration(labelText: '工具 grant 名稱'),
        onSubmitted: (_) => addTool(owner),
      )), TextButton(onPressed: saving ? null : () => addTool(owner), child: const Text('加入工具'))]),
    ]),
  ));

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Owner／模型／工具授權草稿'), actions: [
      IconButton(tooltip: '重新讀取授權草稿', onPressed: loading || saving ? null : load,
        icon: const Icon(Icons.refresh)),
    ]),
    body: loading ? const Center(child: CircularProgressIndicator()) : Form(key: form, child: ListView(
      padding: const EdgeInsets.all(16), children: [
        const Text('僅儲存 Admin 草稿，不會啟用模型、工具或變更正式 Owner 權限。'
          '正式授權仍須部署、憑證、預算與驗收。請勿輸入 API Key。'),
        Text('草稿版本：$version；尚未生效'),
        if (error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text(error!,
          style: TextStyle(color: Theme.of(context).colorScheme.error))),
        if (loaded) ...[
          for (final owner in owners) ownerCard(owner),
          OutlinedButton.icon(onPressed: saving || owners.length >= 100 ? null : () => setState(() {
            owners.add(_OwnerDraft({'ownerId': '', 'models': [], 'tools': []}));
          }), icon: const Icon(Icons.person_add_outlined), label: const Text('新增 Owner 草稿')),
          const SizedBox(height: 16),
          FilledButton(onPressed: saving ? null : save, child: Text(saving ? '儲存中…' : '儲存授權草稿')),
        ] else OutlinedButton(onPressed: load, child: const Text('重新讀取')),
      ],
    )),
  );
}
