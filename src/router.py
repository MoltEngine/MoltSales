import json
import os
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from qdrant_client import QdrantClient
from qdrant_client.http import models

# ==========================================
# 1. PYDANTIC MODELS (STRUCTURED OUTPUTS)
# ==========================================

class DispatcherDecision(BaseModel):
    categories: List[str] = Field(description="The top 2 category names that best match the user intent.")
    reasoning: str = Field(description="Brief explanation of why these categories were chosen.")

class SpecialistDecision(BaseModel):
    selected_prompt_id: str = Field(description="The ID of the single best prompt. If NONE of the 3 options are appropriate for the user's scenario, return 'NONE'.")
    missing_variables: List[str] = Field(description="Variables from the prompt template that are NOT present in the session context.")
    clarifying_question: str = Field(description="If variables are missing, a conversational question to ask the user to get this data. If no variables are missing, set to empty string.")

# ==========================================
# 2. THE ROUTER ENGINE
# ==========================================

class SalesPromptRouter:
    def __init__(self, api_key: str = None):
        # Initialize the Gemini client (requires GEMINI_API_KEY environment variable if not passed)
        self.client = genai.Client(api_key=api_key)
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # 1. Load the JSON Data
        self.load_data()
        
        # 2. Initialize the Local Qdrant Engine (Replaces OpenAI Embeddings)
        self.init_vector_db()
        
    def load_data(self):
        summary_path = os.path.join(self.base_dir, 'data', 'category_summary.json')
        with open(summary_path, 'r') as f:
            self.category_summary = json.load(f)
            
        prompts_path = os.path.join(self.base_dir, 'data', 'mvp_prompts.json')
        with open(prompts_path, 'r') as f:
            self.prompts = json.load(f)

    def init_vector_db(self):
        """Initializes a local, serverless Qdrant DB with Hybrid Search."""
        db_path = os.path.join(self.base_dir, 'local_qdrant')
        self.qdrant = QdrantClient(path=db_path)
        
        # FastEmbed natively downloads and runs the AI models locally.
        # Dense Model: Highly effective semantic retrieval
        self.qdrant.set_model("BAAI/bge-small-en-v1.5")
        
        # Sparse Model: Exact keyword/jargon matching (BM25)
        # We use a try/except in case the local environment doesn't have sparse configured yet.
        self.use_sparse = False
        try:
            self.qdrant.set_sparse_model("Qdrant/bm25")
            self.use_sparse = True
        except Exception:
            print("Note: FastEmbed sparse models not available. Proceeding with Dense Search only.")

        self.collection_name = "prompts"
        
        # Only build the index if it doesn't already exist in the folder
        if not self.qdrant.collection_exists(self.collection_name):
            print(f"Building Hybrid Vector Database for {len(self.prompts)} prompts. This only runs once...")
            
            documents = []
            metadata_list = []
            ids = []
            
            for idx, prompt in enumerate(self.prompts):
                # We embed a combination of Category, Situation, and Task
                doc_text = f"Category: {prompt.get('category')} - Situation: {prompt['metadata'].get('S', '')} - Task: {prompt['metadata'].get('T', '')}"
                
                documents.append(doc_text)
                metadata_list.append(prompt) # We store the whole Prompt JSON in the DB!
                ids.append(idx)
                
            self.qdrant.add(
                collection_name=self.collection_name,
                documents=documents,
                metadata=metadata_list,
                ids=ids
            )
            print("Database built successfully!")

    # ------------------------------------------
    # PHASE 1: THE DISPATCHER
    # ------------------------------------------
    def phase_1_dispatcher(self, user_query: str) -> DispatcherDecision:
        """Uses a tiny context window to route to the Top 2 Categories."""
        print(f"\n[PHASE 1] Dispatcher analyzing query: '{user_query}'")
        
        system_prompt = f"""
        You are the Routing Dispatcher for a Sales AI Agent.
        Review the user's intent and select the TOP 2 most relevant categories from the catalog.
        
        Catalog Data:
        {json.dumps(self.category_summary, indent=2)}
        """
        
        response = self.client.models.generate_content(
            model="gemini-2.5-flash",
            contents=system_prompt + f"\n\nUser Query:\n{user_query}",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=DispatcherDecision,
                temperature=0.0
            ),
        )
        
        decision = DispatcherDecision.model_validate_json(response.text)
        print(f" -> Selected Categories: {decision.categories}")
        print(f" -> Reasoning: {decision.reasoning}")
        return decision

    # ------------------------------------------
    # PHASE 2: FILTER & SEARCH
    # ------------------------------------------
    def phase_2_search(self, user_query: str, top_categories: List[str]) -> List[Dict[str, Any]]:
        """Uses Local Qdrant to perform a mapped hybrid search filtered by Phase 1."""
        print(f"\n[PHASE 2] Executing Hybrid Search for categories: {top_categories}")
        
        # Create a hard filter: The DB is only allowed to search within the Top 2 Categories
        category_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="category",
                    match=models.MatchAny(any=top_categories)
                )
            ]
        )
        
        # Qdrant's .query() automatically performs Reciprocal Rank Fusion (RRF) 
        # combining both Dense AND Sparse (Keyword) vectors if configured!
        results = self.qdrant.query(
            collection_name=self.collection_name,
            query_text=user_query,
            query_filter=category_filter,
            limit=3
        )
        
        # The prompt object was saved in the DB metadata
        top_3 = [res.metadata for res in results]
        
        if not top_3:
            print(" -> No prompts found matching those categories.")
            return []
            
        print(f" -> Top 3 matches found: {[p['id'] for p in top_3]}")
        return top_3

    # ------------------------------------------
    # PHASE 3: THE SPECIALIST
    # ------------------------------------------
    def phase_3_specialist(self, user_query: str, top_3_prompts: List[Dict[str, Any]], session_context: Dict[str, Any]) -> SpecialistDecision:
        """Evaluates the 3 final prompts and extracts missing variables."""
        print("\n[PHASE 3] Specialist identifying final prompt and missing variables...")
        
        system_prompt = f"""
        You are the Sales Implementation Specialist. You have 3 prompt options to fulfill the user's intent.
        
        User Context (Known Data):
        {json.dumps(session_context, indent=2)}
        
        Available Prompts:
        {json.dumps(top_3_prompts, indent=2)}
        
        Instructions:
        1. Select the single 'id' of the prompt that best fulfills the user's needs.
        2. IF AND ONLY IF all 3 prompts are completely irrelevant to the user's scenario, set 'selected_prompt_id' to "NONE".
        3. If a prompt is selected, compare its 'variables' against the 'User Context'. Identify completely missing variables.
        4. If variables are missing, write a natural conversational question to ask the user to provide them.
        5. If "NONE" was selected, use 'clarifying_question' to inform the user that their request isn't specifically covered in the prompt library and ask them to clarify or pick a different topic.
        """
        
        response = self.client.models.generate_content(
            model="gemini-2.5-flash",
            contents=system_prompt + f"\n\nUser Query:\n{user_query}",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SpecialistDecision,
                temperature=0.0
            ),
        )
        
        decision = SpecialistDecision.model_validate_json(response.text)
        
        if decision.selected_prompt_id == "NONE":
            print(" -> Agent determined none of the top 3 prompts are a good fit.")
            print(f" -> Agent Message: {decision.clarifying_question}")
            return decision

        print(f" -> Selected Prompt ID: {decision.selected_prompt_id}")
        if decision.missing_variables:
            print(f" -> Missing Variables: {decision.missing_variables}")
            print(f" -> Agent Question: {decision.clarifying_question}")
        else:
            print(" -> All variables present! Ready to generate final text.")
        return decision

    # ------------------------------------------
    # PHASE 4: THE GENERATOR
    # ------------------------------------------
    def phase_4_generator(self, prompt_id: str, session_context: Dict[str, Any]) -> str:
        """Fills the template variables and generates the final Sales Output."""
        print(f"\n[PHASE 4] Generating final artifact for {prompt_id}...")
        
        # 1. Fetch the raw prompt template from the database
        target_prompt = next((p for p in self.prompts if p['id'] == prompt_id), None)
        if not target_prompt:
            return "Error: Could not find prompt in database."
            
        template = target_prompt['template']
        
        # 2. Extract values from the nested session_context dictionary using LLM for smart mapping
        system_prompt = f"""
        You are a world-class B2B Enterprise Sales Copywriter with a 40% cold reply rate. 
        Your task is to take the provided template and fulfill it using the Known Context.
        
        CRITICAL RULES FOR YOUR WRITING:
        1. NO FLUFF: Be wildly concise. Cut out all "I hope this finds you well" or "I wanted to reach out" filler.
        2. HUMAN TONE: Write like a real executive talking to another executive. Confident, direct, and peer-to-peer. Zero "marketing speak" or buzzword soup.
        3. NO META-TEXT: Return ONLY the final requested email or artifact. DO NOT say "Here is the drafted content:" or "Subject:". Just give the raw text.
        4. SMART INFERENCE: If the Known Context gives you a company or product, intelligently deduce what their typical pain points or value props might be to make the copy highly specific, not generic.
        
        Template constraints: {json.dumps(target_prompt.get('metadata'), indent=2)}
        Known Context: {json.dumps(session_context, indent=2)}
        
        Template to fulfill:
        {template}
        """
        
        # 3. Generate final output natively
        # Reverting to gemini-2.5-flash due to API quota limits for pro tier on the current key.
        response = self.client.models.generate_content(
            model="gemini-2.5-flash",
            contents=system_prompt,
        )
        
        return response.text

# ==========================================
# TEST RUNNER
# ==========================================
if __name__ == "__main__":
    try:
        # NOTE: You MUST have your GEMINI_API_KEY environment variable set for Phase 1 & 3
        # Phase 2 (Embeddings) runs entirely locally!
        router = SalesPromptRouter()
        
        # Mock Session Context
        mock_context = {
            "prospect": {
                "name": "Sarah",
                "role": "CTO",
                "company": "Stripe"
            }
        }
        
        # Test Query with jargon ("ghosted", "price")
        test_query = "I need an email for a prospect who has been ignoring my demo request because they think the price is too high."
        
        print("\n====================================")
        print(" STARTING HYBRID PIPELINE EXECUTION")
        print("====================================")
        
        top_cats = router.phase_1_dispatcher(test_query)
        top_prompts = router.phase_2_search(test_query, top_cats.categories)
        if top_prompts:
            final_decision = router.phase_3_specialist(test_query, top_prompts, mock_context)
            
            print("\n====================================")
            print(" FINAL PIPELINE RESULT")
            print("====================================")
            print(f"Goal: {test_query}")
            print(f"Winning Prompt: {final_decision.selected_prompt_id}")
            
            # THE INTERACTION LOOP
            # If the specialist identified missing variables, stop and ask the user!
            if final_decision.missing_variables:
                print(f"\n🤖 Agent: {final_decision.clarifying_question}")
                
                # Mock handling multiple missing variables at once for simplicity in CLI
                missing_keys = final_decision.missing_variables
                print(f"   (Missing variables: {missing_keys})")
                
                # Wait for user input from the terminal
                user_response = input("🗣️  You: ")
                
                # In a real app, an 'Extractor' LLM would process this sentence. 
                # For this CLI demo, we'll map the raw response to all missing variables.
                print("\n[UPDATING SESSION CONTEXT]")
                mock_context["user_provided"] = user_response
                for key in missing_keys:
                    print(f" -> Filling slot '{key}' with user input.")
                    mock_context[key] = user_response
            
            # Execute Phase 4 (Generation)
            final_artifact = router.phase_4_generator(final_decision.selected_prompt_id, mock_context)
            
            print("\n====================================")
            print(" 🎉 FINAL GENERATED SALES ARTIFACT")
            print("====================================")
            print(final_artifact)

        else:
            print("\nPipeline stopped: No valid prompts retrieved.")
            
    except Exception as e:
         print(f"Error encountered. Ensure GEMINI_API_KEY is set and libraries installed. Details: {e}")
    finally:
        if 'router' in locals() and hasattr(router, 'qdrant'):
            router.qdrant.close()
