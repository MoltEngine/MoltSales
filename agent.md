# Strategic Sales Agent: Implementation Plan

## 1. The Core Architecture
The agent is designed as a **State-Aware Copilot**. Instead of generic retrieval, it maps user needs to a specific "Tree Level" (State) and executes an "Action Space" (Prompt).

## 2. Technical Stack (The 80% Rule)
* **Knowledge Base:** Vector database (e.g., Pinecone/Weaviate) containing the JSON prompt library.
* **Retrieval:** Hybrid Search (Semantic on `STAR` metadata + Keyword on `Category/State`).
* **Reasoning:** LLM-based Intent Router (detects the 'State' from user input).
* **Context Injection:** Automated Tool-Calling to fill `[variables]` using LinkedIn/Google Search APIs.

## 3. Build Phases

### Phase 1: Semantic Mapping (Week 1)
* **Task:** Embed the `metadata.S` (Situation) and `metadata.T` (Task) fields.
* **Goal:** Allow users to describe a "vibe" (e.g., "The client seems bored in meetings") and retrieve the right strategy (e.g., "Status Quo Reframe").

### Phase 2: Variable Slot-Filling (Week 2)
* **Task:** Build an extraction layer that identifies missing placeholders in the selected prompt.
* **Goal:** The agent should say, *"I've selected the ROI builder, but I need you to tell me the [product_cost] first."*

### Phase 3: The "Feedback" Loop (Week 3)
* **Task:** Implement a rating system for prompt outputs.
* **Goal:** Success-weighted retrieval. Prompts that result in booked meetings (Reddit methodology) get prioritized over lower-performing ones.

## 4. Sales State-Machine Guardrails
* **Level 1-2:** Optimized for high-volume, high-relevance.
* **Level 3-4:** Optimized for high-confidence, executive-level language.
* **Rule:** The agent will flag "Out of State" prompts (e.g., using a Breakup Email in Discovery) to ensure the user maintains professional credibility.