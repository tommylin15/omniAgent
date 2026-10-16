/// Only message idempotency metadata, never prompts, OAuth tokens or replies.
abstract class PendingKeyStore {
  String? read(String ownerId);
  void write(String ownerId, String serialized);
  void clear(String ownerId);
}
