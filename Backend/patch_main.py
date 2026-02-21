import os

with open("main.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
skip = False

import_time_added = False

for i, line in enumerate(lines):
    # Add import time at the top
    if not import_time_added and "import json" in line:
        new_lines.append("import time\n")
        new_lines.append(line)
        import_time_added = True
        continue
    
    # Inject _execute_web_search before chat_stream
    if line.startswith("@app.get(\"/chat_stream\")"):
        new_lines.append("""
async def _execute_web_search(analysis, original_query: str, is_real_time: bool):
    search_start = time.time()
    search_terms = analysis.suggested_searches
    if original_query not in search_terms:
        search_terms = [original_query] + search_terms
    max_searches = min(len(search_terms), 4 if is_real_time else 3)
    search_terms = search_terms[:max_searches]
    
    raw_results = await tavily_service.search_multiple(
        search_terms=search_terms,
        is_real_time=is_real_time
    )
    
    from models.schemas import SearchResult, WebSearchResults
    search_results = []
    for result in raw_results:
        try:
            search_result = SearchResult(
                title=result.get('title', 'No title'),
                url=result.get('url', ''),
                content=result.get('content', ''),
                score=result.get('score', 0.0),
                calculated_score=result.get('calculated_score'),
                published_date=result.get('published_date')
            )
            search_results.append(search_result)
        except Exception as e:
            continue
            
    return WebSearchResults(
        total_results=len(search_results),
        search_terms_used=search_terms,
        results=search_results,
        search_duration=time.time() - search_start
    )

""")
        new_lines.append(line)
        continue

    # Fix Phase 5
    if "import re as _re" in line and "phase" not in line.lower() and i < 200:
        continue # skip the redundant import in the phase 5 block
        
    if "yield f\"data: {json.dumps({'type': 'writing_start'})}\\n\\n\"" in line:
        new_lines.append(line)
        new_lines.append("""            await asyncio.sleep(0.3)
            
            # \u2500\u2500 Inject date + conversation context \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
            today = datetime.now().strftime("%A, %B %d, %Y")
            history = conversation_store.get_context_for_llm(session_id) if session_id else []
            streamed_text = ""
""")
        skip = True
        continue
        
    if skip and "Citation normalizer" in line:
        skip = False
        new_lines.append(line)
        continue
        
    if skip:
        continue
        
    # Accumulate streamed text for history save
    if "yield f\"data: {json.dumps({'type': 'content', 'content': clean_token})}\\n\\n\"" in line:
        new_lines.append(line)
        new_lines.append("                            streamed_text += clean_token\n")
        continue

    # Save to history at the end
    if "yield f\"data: {json.dumps({'type': 'end'})}\\n\\n\"" in line:
        new_lines.append("""
            if session_id and streamed_text:
                conversation_store.add_user_message(session_id, message)
                conversation_store.add_assistant_message(session_id, streamed_text)
""")
        new_lines.append(line)
        continue

    new_lines.append(line)

with open("main.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("SUCCESS")
