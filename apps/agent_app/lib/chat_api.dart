import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import 'pending_key_store.dart';
import 'pending_key_store_stub.dart'
    if (dart.library.html) 'pending_key_store_web.dart' as pending_store;

class ChatApi {
  ChatApi(this.token,{http.Client? client,String? baseUrl,PendingKeyStore? pendingKeyStore})
      : client=client ?? http.Client(),
        _baseOverride=baseUrl,
        _pendingKeyStore=pendingKeyStore ?? pending_store.createPendingKeyStore();

  final String token;
  final http.Client client;
  final String? _baseOverride;
  final PendingKeyStore _pendingKeyStore;
  String? _verifiedOwnerId;
  bool _storageInvalid=false;
  final Map<String,String> _pendingByThread={};
  static final _ownerPattern=RegExp(
      r'^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$');
  static final _keyPattern=RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
  static final _messagePath=RegExp(
      r'^/v1/threads/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})/messages$');

  String? get verifiedOwnerId=>_verifiedOwnerId;
  bool hasPendingMessage(String threadId)=>_pendingByThread.containsKey(threadId);

  /// The Owner is trusted only after Chat validates the real Google token.
  Future<void> bindVerifiedOwner() async {
    if(_verifiedOwnerId!=null)return;
    final result=await get('/v1/me');
    final owner=result is Map?result['ownerId']:null;
    if(owner is! String || !_ownerPattern.hasMatch(owner)){
      throw StateError('Owner 身分無法驗證');
    }
    final recovered=<String,String>{};
    try{
      final serialized=_pendingKeyStore.read(owner);
      if(serialized!=null){
        final json=jsonDecode(serialized);
        if(json is! Map || json['version']!=1 || json['items'] is! List ||
           (json['items'] as List).length>32){
          throw const FormatException('unsupported pending record');
        }
        for(final item in json['items'] as List){
          if(item is! Map || item['threadId'] is! String ||
             item['key'] is! String ||
             !_messagePath.hasMatch('/v1/threads/${item['threadId']}/messages') ||
             !_keyPattern.hasMatch(item['key'] as String) ||
             recovered.containsKey(item['threadId'])){
            throw const FormatException('invalid pending entry');
          }
          recovered[item['threadId'] as String]=item['key'] as String;
        }
      }
    }catch(_){
      // Corruption / denied sessionStorage must block new writes, not reset.
      _storageInvalid=true;
    }
    _verifiedOwnerId=owner;
    _pendingByThread.addAll(recovered);
  }

  void _persistPending(){
    final owner=_verifiedOwnerId;
    if(owner==null)return; // old unit-test clients without OAuth binding
    if(_storageInvalid || _pendingByThread.length>32){
      throw StateError('未確認訊息資料無法安全保存');
    }
    _pendingKeyStore.write(owner,jsonEncode({
      'version':1,
      'items':[
        for(final entry in _pendingByThread.entries)
          {'threadId':entry.key,'key':entry.value}
      ],
    }));
  }

  void _rememberPending(String threadId,String key){
    if(_verifiedOwnerId==null)return;
    if(_storageInvalid){
      throw StateError('未確認訊息保存異常，已禁止送出');
    }
    final existing=_pendingByThread[threadId];
    if(existing!=null && existing!=key){
      throw StateError('此對話有尚未確認的請求，請先讀回原始回合');
    }
    if(existing==null){
      _pendingByThread[threadId]=key;
      try{_persistPending();}
      catch(_){
        _pendingByThread.remove(threadId);
        throw StateError('無法保存原始請求識別，訊息未送出');
      }
    }
  }

  void _forgetPending(String threadId,String key){
    if(_pendingByThread[threadId]!=key)return;
    _pendingByThread.remove(threadId);
    try{_persistPending();}
    catch(_){
      _pendingByThread[threadId]=key;
      _storageInvalid=true;
      throw StateError('未確認請求清理失敗，已暫停新寫入');
    }
  }

  void clearPersistedPendingForOwner(){
    final owner=_verifiedOwnerId;
    if(owner==null)return;
    try{_pendingKeyStore.clear(owner);}
    catch(_){_storageInvalid=true;}
    _pendingByThread.clear();
  }

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
    final messageThread=method=='POST'?_messagePath.firstMatch(path)?.group(1):null;
    if(messageThread!=null && key!=null){
      _rememberPending(messageThread,key);
    }
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
        // The server returns this before store.message(): nothing committed.
        if(messageThread!=null && key!=null){
          _forgetPending(messageThread,key);
          if(intent!=null){_unconfirmedPosts.remove(intent);}
        }
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
    if(messageThread!=null && key!=null){
      _forgetPending(messageThread,key);
    }
    if(intent!=null){_unconfirmedPosts.remove(intent);}
    return decoded;
  }

  /// After a lost POST response, query PostgreSQL with the *same* key.
  /// A missing row may be a racing write; preserve key and do not auto-POST.
  Future<Map<String,dynamic>?> reconcilePendingMessage(
      String threadId,String content) async {
    final path='/v1/threads/$threadId/messages';
    final intent=jsonEncode([path,jsonEncode({'content':content})]);
    final key=_unconfirmedPosts[intent] ?? _pendingByThread[threadId];
    final origin=_baseOverride ?? base;
    if (key==null || token.isEmpty || origin.isEmpty) {
      return null;
    }
    try {
      final req=http.Request('GET',
          Uri.parse('$origin/v1/threads/$threadId/turns/reconcile'))
        ..headers.addAll({'Authorization':'Bearer $token','Idempotency-Key':key});
      final response=await http.Response.fromStream(await client.send(req));
      if (response.statusCode != 200) {
        return null;
      }
      final decoded=jsonDecode(utf8.decode(response.bodyBytes));
      final turn=decoded is Map ? decoded['turn'] : null;
      if (turn is! Map || turn['turnId'] is! String ||
          !const ['QUEUED','RUNNING','COMPLETED','CANCELLED','ERROR']
              .contains(turn['status'])) {
        return null;
      }
      _forgetPending(threadId,key);
      _unconfirmedPosts.removeWhere((_,value)=>value==key);
      return {'turnId':turn['turnId'],'status':turn['status']};
    } catch (_){return null;}
  }

  /// Reload recovery never sends the original prompt or another model POST.
  /// A null row is uncertain while an earlier request might still commit.
  Future<Map<String,dynamic>?> reconcileRecoveredMessage(String threadId) async{
    final key=_pendingByThread[threadId];
    final origin=_baseOverride ?? base;
    if(key==null || origin.isEmpty || token.isEmpty)return null;
    try{
      final req=http.Request('GET',
          Uri.parse('$origin/v1/threads/$threadId/turns/reconcile'))
        ..headers.addAll({'Authorization':'Bearer $token',
                          'Idempotency-Key':key});
      final response=await http.Response.fromStream(await client.send(req));
      if(response.statusCode!=200)return null;
      final decoded=jsonDecode(utf8.decode(response.bodyBytes));
      final turn=decoded is Map?decoded['turn']:null;
      if(turn is! Map || turn['turnId'] is! String ||
         !const ['QUEUED','RUNNING','COMPLETED','CANCELLED','ERROR']
             .contains(turn['status'])){
        return null;
      }
      _forgetPending(threadId,key);
      _unconfirmedPosts.removeWhere((_,value)=>value==key);
      return {'turnId':turn['turnId'],'status':turn['status']};
    }catch(_){return null;}
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

  void close({bool clearPersistedPending=false}){
    if(clearPersistedPending){
      clearPersistedPendingForOwner();
    }
    _pendingByThread.clear();
    _unconfirmedPosts.clear();
    lastRequestId = null;
    client.close();
  }
}
