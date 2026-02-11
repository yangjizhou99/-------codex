from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from mining import mine_patterns
import uvicorn

app = FastAPI()

class AnalyzeRequest(BaseModel):
    sentences: List[str]
    min_support: int = 2

@app.post("/analyze")
async def analyze_sentences(request: AnalyzeRequest):
    try:
        # 简单清洗空行
        clean_sentences = [s.strip() for s in request.sentences if s.strip()]
        if not clean_sentences:
            return {"patterns": []}
            
        patterns = mine_patterns(clean_sentences, min_support=request.min_support)
        return {"patterns": patterns}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8006)
