import 'dart:convert';

import 'package:http/http.dart' as http;

class ChatApi {
  ChatApi(this.token, {http.Client? client}) : client = client ?? http.Client();

  final String token;
  final http.Client client;
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
    if (base.isEmpty || token.isEmpty) throw StateError('omniAgent API 未設定');
    final request = http.Request(method, Uri.parse('$base$path'))
      ..headers.addAll({
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
        if (method == 'POST')
          'Idempotency-Key': DateTime.now().microsecondsSinceEpoch.toString(),
      });
    if (body != null) request.body = jsonEncode(body);
    final response = await http.Response.fromStream(await client.send(request));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (response.statusCode == 503 && response.bodyBytes.isNotEmpty &&
          (jsonDecode(utf8.decode(response.bodyBytes)) as Map)['error'] == 'dispatch_unavailable') {
        throw StateError('模型執行尚未啟用，或此帳號尚未獲授權；訊息未送入排隊');
      }
      throw Exception('omniAgent API ${response.statusCode}');
    }
    return response.bodyBytes.isEmpty ? null : jsonDecode(utf8.decode(response.bodyBytes));
  }

  Future<List<Map<String, dynamic>>> events(String threadId, int cursor) async {
    if (base.isEmpty || token.isEmpty) throw StateError('omniAgent API 未設定');
    final request = http.Request('GET',
        Uri.parse('$base/v1/threads/$threadId/events?cursor=$cursor&limit=200'))
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

  void close() => client.close();
}
