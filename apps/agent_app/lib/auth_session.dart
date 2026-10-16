import 'chat_api.dart';

/// Prevents a previous Google user's Chat session from surviving sign-out,
/// account switching, or an out-of-order asynchronous ID-token response.
class AuthSessionController {
  AuthSessionController({required this.onSession,required this.onError,
      Future<void> Function(ChatApi)? bindApi})
      : _bindApi=bindApi ?? ((api)=>api.bindVerifiedOwner());

  final void Function(ChatApi?) onSession;
  final void Function() onError;
  final Future<void> Function(ChatApi) _bindApi;

  int _generation = 0;
  bool _disposed = false;
  ChatApi? _current;

  ChatApi? get current => _current;

  /// A null provider is an explicit sign-out. Never cache an old user's API
  /// client while the next account's token is being resolved.
  Future<void> update(Future<String?> Function()? tokenProvider) async {
    if (_disposed) return;
    final generation = ++_generation;
    final previous = _current;
    _current = null;
    previous?.close();
    onSession(null);
    if(tokenProvider==null){
      previous?.clearPersistedPendingForOwner();
      return;
    }
    ChatApi? next;
    try{
      final token = await tokenProvider();
      if (_disposed || generation != _generation) return;
      if (token == null || token.isEmpty) {
        throw StateError('Google ID token unavailable');
      }
      next=ChatApi(token);
      await _bindApi(next);
      if(_disposed || generation!=_generation){
        next.close();
        return;
      }
      // Drop the former Owner's session metadata only after the new backend-
      // verified identity is known. Same Owner token refresh keeps recovery.
      if(previous?.verifiedOwnerId!=null &&
          previous!.verifiedOwnerId!=next.verifiedOwnerId){
        previous.clearPersistedPendingForOwner();
      }
      _current=next;
      onSession(next);
    }catch(_){
      next?.close();
      previous?.clearPersistedPendingForOwner();
      if(!_disposed && generation==_generation){onError();}
    }
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _generation++;
    _current?.close();
    _current = null;
  }
}
