"""
Bidinn CRM Backend - Python wrapper for Node.js Express server
This file acts as a bridge for Emergent deployment which expects uvicorn server:app
"""
import subprocess
import os
import sys
import time
import signal
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI(title="Bidinn CRM API Proxy")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Node.js backend process
node_process = None
NODE_BACKEND_URL = "http://127.0.0.1:8002"

def start_node_backend():
    """Start the Node.js Express backend on port 8002"""
    global node_process
    
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Check if dist/index.js exists
    dist_path = os.path.join(backend_dir, "dist", "index.js")
    if not os.path.exists(dist_path):
        print("Building TypeScript...")
        build_result = subprocess.run(
            ["npm", "run", "build"],
            cwd=backend_dir,
            capture_output=True,
            text=True
        )
        if build_result.returncode != 0:
            print(f"Build failed: {build_result.stderr}")
            return False
    
    # Set PORT environment variable to 8002 for the Node backend
    env = os.environ.copy()
    env["PORT"] = "8002"
    
    print("Starting Node.js backend on port 8002...")
    node_process = subprocess.Popen(
        ["node", "dist/index.js"],
        cwd=backend_dir,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    # Wait for Node.js backend to start
    for i in range(30):
        try:
            response = httpx.get(f"{NODE_BACKEND_URL}/api/health", timeout=2)
            if response.status_code == 200:
                print("Node.js backend started successfully!")
                return True
        except:
            pass
        time.sleep(1)
    
    print("Failed to start Node.js backend")
    return False

@app.on_event("startup")
async def startup_event():
    """Start Node.js backend when FastAPI starts"""
    if not start_node_backend():
        print("WARNING: Node.js backend failed to start")

@app.on_event("shutdown")
async def shutdown_event():
    """Stop Node.js backend when FastAPI stops"""
    global node_process
    if node_process:
        node_process.terminate()
        node_process.wait()

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy(request: Request, path: str):
    """Proxy all requests to Node.js backend"""
    async with httpx.AsyncClient() as client:
        url = f"{NODE_BACKEND_URL}/{path}"
        
        # Get request body
        body = await request.body()
        
        # Forward headers
        headers = dict(request.headers)
        headers.pop("host", None)
        
        try:
            response = await client.request(
                method=request.method,
                url=url,
                headers=headers,
                content=body,
                params=request.query_params,
                timeout=60.0
            )
            
            # Return proxied response
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.headers.get("content-type")
            )
        except httpx.RequestError as e:
            return Response(
                content=f'{{"detail": "Backend unavailable: {str(e)}"}}',
                status_code=503,
                media_type="application/json"
            )

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "ok", "service": "Bidinn CRM API Proxy"}
