"""Patch main.py: inject today + history into PHASE 5, add _execute_web_search, save history."""

with open('main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Detect line ending
crlf = '\r\n' in content
NL = '\r\n' if crlf else '\n'
print(f"Line ending: {'CRLF' if crlf else 'LF'}")

# ── Patch 1: inject today + history + remove stale import re ──────────────
p1_old = (
    '            # \U0001f3af PHASE 5: RESPONSE GENERATION' + NL +
    '            yield f"data: {json.dumps({\'type\': \'writing_start\'})}\n\n"' + NL +
    '            await asyncio.sleep(0.3)' + NL +
    '            ' + NL +
    '            # \u2500\u2500 Citation normalizer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500' + NL +
    '            # Buffers the streaming output and converts any non-standard citation' + NL +
    '            # formats (e.g. OpenAI file-search \u300615\u2020L1-L3\u3017) to clean [N] brackets.' + NL +
    '            import re as _re' + NL
)

p1_new = (
    '            # \U0001f3af PHASE 5: RESPONSE GENERATION' + NL +
    '            yield f"data: {json.dumps({\'type\': \'writing_start\'})}\n\n"' + NL +
    '            await asyncio.sleep(0.3)' + NL +
    NL +
    '            # \u2500\u2500 Inject date + conversation history \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500' + NL +
    '            today = datetime.now().strftime("%A, %B %d, %Y")' + NL +
    '            history = (' + NL +
    '                conversation_store.get_context_for_llm(session_id)' + NL +
    '                if session_id else []' + NL +
    '            )' + NL +
    NL +
    '            # \u2500\u2500 Citation normalizer: converts \u3010N\u2020...\u3011 \u2192 [N] at stream \u2500\u2500\u2500\u2500\u2500\u2500\u2500' + NL
)

if p1_old in content:
    content = content.replace(p1_old, p1_new, 1)
    print('Patch 1 (today+history): SUCCESS')
else:
    print('Patch 1 NOT FOUND')
    idx = content.find('PHASE 5: RESPONSE GENERATION')
    print(repr(content[idx:idx+400]))

# ── Patch 2: save conversation turn after 'end' event ────────────────────
p2_old = '            yield f"data: {json.dumps({\'type\': \'end\'})}\n\n"' + NL
p2_new = (
    '            # \u2500\u2500 Persist this conversation turn \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500' + NL +
    '            if session_id and \'streamed_text\' in locals() and streamed_text:' + NL +
    '                conversation_store.add_user_message(session_id, message)' + NL +
    '                conversation_store.add_assistant_message(session_id, streamed_text)' + NL +
    NL +
    '            yield f"data: {json.dumps({\'type\': \'end\'})}\n\n"' + NL
)

if p2_old in content:
    content = content.replace(p2_old, p2_new, 1)
    print('Patch 2 (save history): SUCCESS')
else:
    print('Patch 2 NOT FOUND')

with open('main.py', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done.')
