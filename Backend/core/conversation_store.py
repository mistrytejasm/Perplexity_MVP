"""
Conversation store — keeps a rolling window of chat turns per session.
Stored in-memory; survives for the lifetime of the server process.
"""
from collections import defaultdict
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)

# Message type: {"role": "user"|"assistant", "content": str}
ChatMessage = Dict[str, str]


class ConversationStore:
    """
    Simple in-memory conversation history per session_id.
    Stores the last `max_turns` (user + assistant) pairs.
    """

    def __init__(self, max_turns: int = 5):
        self.max_turns = max_turns
        # session_id → list of {"role": ..., "content": ...}
        self._store: Dict[str, List[ChatMessage]] = defaultdict(list)

    # ─── Write ────────────────────────────────────────────────────────────────

    def add_user_message(self, session_id: str, content: str) -> None:
        """Record a user message."""
        self._store[session_id].append({"role": "user", "content": content})
        self._trim(session_id)

    def add_assistant_message(self, session_id: str, content: str) -> None:
        """Record an assistant response."""
        self._store[session_id].append({"role": "assistant", "content": content})
        self._trim(session_id)

    # ─── Read ─────────────────────────────────────────────────────────────────

    def get_history(self, session_id: str) -> List[ChatMessage]:
        """Return the full message history for a session (already within max_turns)."""
        return list(self._store.get(session_id, []))

    def get_context_for_llm(self, session_id: str) -> List[ChatMessage]:
        """
        Return messages formatted for passing directly to Groq chat.completions.
        Excludes the most recent user message (the current query — caller adds it).
        """
        history = self.get_history(session_id)
        # Drop the last user message if it's there (current query not yet answered)
        if history and history[-1]["role"] == "user":
            history = history[:-1]
        return history

    # ─── Housekeeping ─────────────────────────────────────────────────────────

    def _trim(self, session_id: str) -> None:
        """Keep only the last max_turns * 2 messages (user + assistant pairs)."""
        messages = self._store[session_id]
        max_messages = self.max_turns * 2
        if len(messages) > max_messages:
            self._store[session_id] = messages[-max_messages:]

    def clear_session(self, session_id: str) -> None:
        """Clear conversation history for a session."""
        self._store.pop(session_id, None)
        logger.info(f"🗑️ Cleared conversation history for session {session_id}")

    def session_count(self) -> int:
        """Number of active sessions (for monitoring)."""
        return len(self._store)
