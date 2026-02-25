from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Dict, Any
import os
import traceback
from dotenv import load_dotenv

load_dotenv()

from .router import SalesPromptRouter

app = FastAPI(title="Sales Prompt Router API")

# Enable CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the router engine
router = None

@app.on_event("startup")
async def startup_event():
    global router
    # Check if we have the API key
    if not os.environ.get("GEMINI_API_KEY"):
        print("WARNING: GEMINI_API_KEY environment variable is not set. API calls to Gemini will fail.")
    router = SalesPromptRouter()

class Phase1Request(BaseModel):
    query: str

class Phase2Request(BaseModel):
    query: str
    categories: List[str]

class Phase3Request(BaseModel):
    query: str
    top3: List[Dict[str, Any]]
    context: Dict[str, str]

class Phase4Request(BaseModel):
    promptId: str
    context: Dict[str, str]

@app.post("/api/phase1")
async def api_phase_1(req: Phase1Request):
    try:
        decision = router.phase_1_dispatcher(req.query)
        return {
            "categories": decision.categories,
            "reasoning": decision.reasoning
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/phase2")
async def api_phase_2(req: Phase2Request):
    try:
        top_prompts = router.phase_2_search(req.query, req.categories)
        return top_prompts
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/phase3")
async def api_phase_3(req: Phase3Request):
    try:
        decision = router.phase_3_specialist(req.query, req.top3, req.context)
        
        # We need to return prompt details along with the decision
        # Let's find the matching prompt.
        prompt = None
        if decision.selected_prompt_id != "NONE":
            prompt = next((p for p in req.top3 if p['id'] == decision.selected_prompt_id), None)
            
        return {
            "selected_prompt_id": decision.selected_prompt_id,
            "missing_variables": decision.missing_variables,
            "clarifying_question": decision.clarifying_question,
            "prompt": prompt
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/phase4")
async def api_phase_4(req: Phase4Request):
    try:
        result = router.phase_4_generator(req.promptId, req.context)
        return {"output": result}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Mount the static files so you can run frontend from the same server
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.isdir(frontend_path):
    app.mount("/frontend", StaticFiles(directory=frontend_path), name="frontend")
    
# You can also mount data or others if needed
