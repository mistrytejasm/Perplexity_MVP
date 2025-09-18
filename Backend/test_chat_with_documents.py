import requests
import json
import time

def test_chat_with_documents():
    """Test the complete document chat workflow"""
    
    BASE_URL = "http://localhost:8000"
    SESSION_ID = "test_chat_session"
    
    print("🧪 Testing Document Chat Workflow")
    print("=" * 40)
    
    # Step 1: Upload document
    print("\n1️⃣ Uploading document...")
    with open("test_document.pdf", "rb") as pdf_file:
        files = {"file": ("test_document.pdf", pdf_file, "application/pdf")}
        data = {"session_id": SESSION_ID}
        
        response = requests.post(f"{BASE_URL}/documents/upload", files=files, data=data)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Document uploaded: {result['total_chunks']} chunks")
        else:
            print(f"❌ Upload failed: {response.text}")
            return
    
    # Step 2: Wait a moment for processing to complete
    time.sleep(1)
    
    # Step 3: Test chat with document context
    print("\n2️⃣ Testing chat with document...")
    
    chat_url = f"{BASE_URL}/chat_stream"
    params = {
        "message": "what is Long Short Term Memory?",
        "session_id": SESSION_ID
    }
    
    print(f"Sending query: {params['message']}")
    print("\n📝 Streaming Response:")
    print("-" * 40)
    
    # Stream the response
    response = requests.get(chat_url, params=params, stream=True)
    
    if response.status_code == 200:
        full_response = ""
        
        for line in response.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                if line_str.startswith('data: '):
                    try:
                        data = json.loads(line_str[6:])  # Remove 'data: ' prefix
                        
                        if data.get('type') == 'document_search':
                            print(f"🔍 Found {data.get('results')} document results")
                        
                        elif data.get('type') == 'content':
                            content = data.get('content', '')
                            print(content, end='', flush=True)
                            full_response += content
                        
                        elif data.get('type') == 'end':
                            print("\n" + "-" * 40)
                            break
                            
                    except json.JSONDecodeError:
                        continue
        
        print(f"\n✅ Chat response completed!")
        print(f"📊 Total response length: {len(full_response)} characters")
        
    else:
        print(f"❌ Chat failed: {response.status_code}")

if __name__ == "__main__":
    test_chat_with_documents()
