import re
from typing import AsyncGenerator

# Citation normalizer: converts 【N†...】 → [N] in real-time
_CITATION_RE = re.compile(
    r'》|《|'  # left/right corners
    r'【(\d+)(?:†[^\u3011]*)?】|'  # 【N†...】
    r'《(\d+)(?:†[^\u300b]*)?》|'  # 《N†...》 variant
    r'\\u3010(\d+)[^\\u3011]*\\u3011'  # escaped variant
)

async def normalized_stream(raw_stream) -> AsyncGenerator[str, None]:
    """Yield clean tokens with 【N†...】→[N] substitution."""
    buf = ""
    async for chunk in raw_stream:
        token = chunk.choices[0].delta.content or ""
        if not token:
            continue
        buf += token
        # Only flush when we're not mid-citation bracket
        while buf:
            # Check if buf might be the start of a citation bracket
            # Flush safe prefix before any potential citation
            safe_end = len(buf)
            for marker in ['【', '《', '\\u3010']:
                idx = buf.find(marker)
                if idx != -1:
                    safe_end = min(safe_end, idx)
            if safe_end > 0:
                clean = buf[:safe_end]
                buf = buf[safe_end:]
                yield clean
            elif len(buf) > 40:
                # Safety: if buffer grows without a bracket close, flush it
                yield buf
                buf = ""
            else:
                break
    # Flush remainder
    if buf:
        yield buf

def clean_citation(text: str) -> str:
    """Replace any variant citation format with [N]."""
    # 【N†L1-L3】 or 【N】
    text = re.sub(r'【(\d+)(?:†[^】]*)?】', r'[\1]', text)
    # 《N†...》
    text = re.sub(r'《(\d+)(?:†[^》]*)?》', r'[\1]', text)
    # Unicode escapes \u3010...\u3011
    text = re.sub(r'\\u3010(\d+)[^\\u3011]*\\u3011', r'[\1]', text)
    # Stray L1-L5 like artifacts after bracket removal
    text = re.sub(r'†L\d+-L\d+', '', text)
    return text
