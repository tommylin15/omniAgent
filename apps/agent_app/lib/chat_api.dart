import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

class ChatApi {
  ChatApi(this.token, {http.Client? client, String? baseUrl})
      : client = client ?? http.Client(), _baseOverride = baseUrl;

  final String token;
  final http.Client client;
  final String? _baseOverride;
  // Unknown POST outcomes reuse the same intent ID until 2xx is confirmed.
  // Isolated to this authenticated API session; never shared across Owners.
  final Map<String, String> _unconfirmedPosts = {};

  static String _newIdempotencyKey() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-'
        '${hex.substring(20)}';
  }
  // Per-authenticated-session correlation; this is NOT a token or user ID.
  String? lastRequestId;
  static const _configuredBase = String.fromEnvironment('OMNIAGENT_API_BASE_URL');
  static String get base {
    if (_configuredBase.isNotEmpty) return _configuredBase;
    final uri = Uri.base;
    return uri.scheme == 'http' || uri.scheme == 'https' ? uri.origin : '';
  }

  Future<dynamic> get(String path) => _request('GET', path);
  Future<dynamic> delete(String path) => _request('DELETE', path);
  Future<dynamic> post(String path, Map<String, dynamic> body) =>
      _request('POST', path, body);

  Future<dynamic> _request(String method, String path,
      [Map<String, dynamic>? body]) async {
    final origin = _baseOverride ?? base;
    if (origin.isEmpty || token.isEmpty) throw StateError('omniAgent API 未設定');
    final wireBody = body == null ? null : jsonEncode(body);
    final intent = method == 'POST' ? jsonEncode([path, wireBody]) : null;
    if (intent != null && !_unconfirmedPosts.containsKey(intent) &&
        _unconfirmedPosts.length >= 64) {
      throw StateError('結果不明的操作過多，請先重新整理狀態');
    }
    final key = intent == null ? null
        : _unconfirmedPosts.putIfAbsent(intent, _newIdempotencyKey);
    lastRequestId = null;
    final request = http.Request(method, Uri.parse('$origin$path'))
      ..headers.addAll({
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
        if (key != null) 'Idempotency-Key': key,
      });
    if (wireBody != null) request.body = wireBody;
    // Timeouts or unknown HTTP errors must not silently create a new turn.
    final response = await http.Response.fromStream(await client.send(request));
    final candidate = response.headers['x-omniagent-request-id'];
    lastRequestId = candidate != null &&
        RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(candidate)
        ? candidate : null;
    final suffix = lastRequestId == null ? '' : '（追蹤碼：$lastRequestId）';
    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (response.statusCode == 503 && response.bodyBytes.isNotEmpty &&
          (jsonDecode(utf8.decode(response.bodyBytes)) as Map)['error'] == 'dispatch_unavailable') {
        throw StateError('模型執行尚未啟用，或此帳號尚未獲授權；訊息未送入排隊$suffix');
      }
      throw StateError('omniAgent API ${response.statusCode}$suffix');
    }
    // Decode first: a truncated 2xx body still has an uncertain outcome.
    // Reusing the original key is essential if the client retries it.
    final decoded = response.bodyBytes.isEmpty
        ? null : jsonDecode(utf8.decode(response.bodyBytes));
    // A successful HTTP status is not a confirmed write if the response
    // loses its durable identifier. Keep the same POST key for reconciliation.
    final isThreadMutation = path == '/v1/threads' || path.endsWith('/fork');
    final isMessageMutation = path.endsWith('/messages');
    if (method == 'POST' && isThreadMutation &&
        (decoded is! Map || decoded['thread_id'] is! String)) {
      throw StateError('對話建立結果不明；請先重新載入對話，勿直接建立第二筆');
    }
    if (method == 'POST' && isMessageMutation &&
        (decoded is! Map || decoded['turn'] is! Map ||
            decoded['turn']['turn_id'] is! String)) {
      throw StateError('訊息提交結果不明；請先重新載入事件，勿重新送出新請求');
    }
    if (intent != null) _unconfirmedPosts.remove(intent);
    return decoded;
  }

  /// After a lost POST response, query PostgreSQL with the *same* key.
  /// A missing row may be a racing write; preserve key and do not auto-POST.
  Future<Map<String,dynamic>?> reconcilePendingMessage(
      String threadId,String content) async {
    final path='/v1/threads/$threadId/messages';
    final intent=jsonEncode([path,jsonEncode({'content':content})]);
    final key=_unconfirmedPosts[intent];
    final origin=_baseOverride ?? base;
    if(key==null || token.isEmpty || origin.isEmpty)return null;
    try {
      final req=http.Request('GET',
          Uri.parse('$origin/v1/threads/$threadId/turns/reconcile'))
        ..headers.addAll({'Authorization':'Bearer $token','Idempotency-Key':key});
      final response=await http.Response.fromStream(await client.send(req));
      if(response.statusCode!=200)return null;
      final decoded=jsonDecode(utf8.decode(response.bodyBytes));
      final turn=decoded is Map ? decoded['turn'] : null;
      if(turn is! Map || turn['turnId'] is! String ||
          !const ['QUEUED','RUNNING','COMPLETED','CANCELLED','ERROR']
             .contains(turn['status']))return null;
      _unconfirmedPosts.remove(intent);
      return {'turnId':turn['turnId'],'status':turn['status']};
    } catch (_){return null;}
  }

  Future<List<Map<String, dynamic>>> events(String threadId, int cursor) async {
    final origin = _baseOverride ?? base;
    if (origin.isEmpty || token.isEmpty) throw StateError('omniAgent API 未設定');
    final request = http.Request('GET',
        Uri.parse('$origin/v1/threads/$threadId/events?cursor=$cursor&limit=200'))
      ..headers['Authorization'] = 'Bearer $token';
    final response = await http.Response.fromStream(await client.send(request));
    if (response.statusCode != 200) throw Exception('事件串流暫時無法使用');
    final rows = <Map<String, dynamic>>[];
    String? event, id;
    final data = StringBuffer();
    void flush() {
      if (data.isEmpty) return;
      final value = jsonDecode(data.toString()) as Map<String, dynamic>;
      rows.add({
        ...value,
        'event_type': event ?? value['event_type'],
        'seq': int.tryParse(id ?? '') ?? value['seq']
      });
      event = null;
      id = null;
      data.clear();
    }

    for (final line in const LineSplitter().convert(utf8.decode(response.bodyBytes))) {
      if (line.isEmpty) {
        flush();
      } else if (line.startsWith('event: ')) {
        event = line.substring(7);
      } else if (line.startsWith('id: ')) {
        id = line.substring(4);
      } else if (line.startsWith('data: ')) {
        data.write(line.substring(6));
      }
    }
    flush();
    return rows;
  }

  void close() {
    _unconfirmedPosts.clear();
    lastRequestId = null;
    client.close();
  }
}
