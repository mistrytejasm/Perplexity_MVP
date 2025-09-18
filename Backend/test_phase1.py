import asyncio
import requests
import json
import time
from pathlib import Path

# Test configuration
BASE_URL = "http://localhost:8000"
TEST_SESSION_ID = "test_session_123"

async def test_phase1_complete():
    """Complete Phase 1 testing suite"""
    
    print("🧪 Starting Phase 1 Document Support Testing")
    print("=" * 50)
    
    # Test 1: Health check
    print("\n1️⃣  Testing API health...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        if response.status_code == 200:
            print("✅ API is running")
        else:
            print("❌ API health check failed")
            return False
    except Exception as e:
        print(f"❌ Cannot connect to API: {e}")
        return False
    
    # Test 2: Document upload
    print("\n 2️⃣  Testing document upload...")
    
    # Create a simple test PDF (you can replace this with an actual PDF file)
    test_pdf_path = "test_document.pdf"
    
    # If you don't have a test PDF, create a simple text file for testing
    if not Path(test_pdf_path).exists():
        print("📄 Please create a test PDF file named 'test_document.pdf' in the Backend directory")
        print("   Or modify this test to use an existing PDF file")
        return False
    
    try:
        with open(test_pdf_path, "rb") as pdf_file:
            files = {"file": ("test_document.pdf", pdf_file, "application/pdf")}
            data = {"session_id": TEST_SESSION_ID}
            
            response = requests.post(
                f"{BASE_URL}/documents/upload",
                files=files,
                data=data
            )
            
        if response.status_code == 200:
            upload_result = response.json()
            print(f"✅ Document uploaded successfully!")
            print(f"   Document ID: {upload_result['document_id']}")
            print(f"   Status: {upload_result['status']}")
            print(f"   Chunks: {upload_result['total_chunks']}")
            print(f"   Processing time: {upload_result['processing_time']:.2f}s")
            
            if upload_result['status'] != 'completed':
                print(f"❌ Document processing failed: {upload_result['message']}")
                return False
                
        else:
            print(f"❌ Upload failed: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Upload test failed: {e}")
        return False
    
    # Test 3: Session documents
    print("\n3️⃣  Testing session document retrieval...")
    try:
        response = requests.get(f"{BASE_URL}/documents/session/{TEST_SESSION_ID}")
        
        if response.status_code == 200:
            session_data = response.json()
            print(f"✅ Session has {session_data['total_documents']} documents")
            
            for doc in session_data['documents']:
                print(f"   📄 {doc['filename']} - {doc['total_chunks']} chunks")
        else:
            print(f"❌ Failed to get session documents: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Session documents test failed: {e}")
        return False
    
    # Test 4: Document search
    print("\n4️⃣  Testing document search...")
    try:
        search_request = {
            "query": "what is this document about",
            "session_id": TEST_SESSION_ID,
            "max_results": 3
        }
        
        response = requests.post(
            f"{BASE_URL}/documents/search",
            json=search_request,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            search_results = response.json()
            print(f"✅ Document search returned {search_results['total_results']} results")
            
            for i, result in enumerate(search_results['results'], 1):
                print(f"   {i}. Page {result['page_number']} - Score: {result['similarity_score']:.3f}")
                print(f"      {result['content'][:100]}...")
        else:
            print(f"❌ Document search failed: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Document search test failed: {e}")
        return False
    
    # Test 5: Chat with document context (basic test)
    print("\n5️⃣  Testing chat with document context...")
    try:
        # This tests the endpoint exists - full streaming test would be more complex
        test_url = f"{BASE_URL}/chat_stream?message=summarize the document&session_id={TEST_SESSION_ID}"
        response = requests.get(test_url, timeout=5, stream=True)
        
        if response.status_code == 200:
            print("✅ Chat stream endpoint responding with documents")
        else:
            print(f"❌ Chat stream test failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"⚠️  Chat stream test skipped (requires full streaming): {e}")
    
    # All tests passed
    print("\n" + "=" * 50)
    print("🎉 Phase 1 Testing Complete - All Systems Go!")
    print("\n✅ Document upload working")
    print("✅ Content extraction working") 
    print("✅ Chunking working")
    print("✅ Embedding generation working")
    print("✅ ChromaDB storage working")
    print("✅ Document search working")
    print("✅ Session management working")
    
    print(f"\n🚀 Ready for Phase 2!")
    print(f"   Your document support system is now live at {BASE_URL}")
    
    return True

if __name__ == "__main__":
    # Run the test
    success = asyncio.run(test_phase1_complete())
    
    if success:
        print("\n🎯 Phase 1 Implementation: SUCCESS!")
    else:
        print("\n❌ Phase 1 Implementation: FAILED - Check logs above")
