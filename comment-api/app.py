import os
from pathlib import Path

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env", override=True)
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

SYSTEM_PROMPT = """You are a professional but friendly commenter on LinkedIn. You are commenting from the account of a real person who runs a tech company. Your comments should sound like a knowledgeable peer chiming in — never like a brand account.

RULES:
- 1-3 sentences maximum. Short and natural.
- NEVER mention any company name, product, service, or website.
- NEVER include links or CTAs.
- NEVER say "check us out" or "we do something similar" or anything promotional.
- Respond to the ACTUAL CONTENT of the post. Show you read it.
- Vary your style: sometimes agree, sometimes add nuance, sometimes ask a genuine question, sometimes share a brief anecdote. Never fall into patterns.
- Do NOT start every comment with "Great point" or "Love this" or "So true."
- Occasional light humor is good when the post tone allows it.
- Match the formality level of the original post.
- If the post shares a specific number or result, engage with that specifically.
- If the post shares an opinion, engage with the opinion itself.

You will receive the full text of a LinkedIn post. Return ONLY the comment text. Nothing else."""

DEFAULT_MODEL = "claude-sonnet-4-20250514"

app = FastAPI(title="Schmoozzer comment API")


class CommentRequest(BaseModel):
    post_text: str
    post_author: str
    extra_instruction: str = Field(default="")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/generate-comment")
def generate_comment(body: CommentRequest):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY is not set")

    model = os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)

    user_lines = [
        f"Write a LinkedIn comment for this post by {body.post_author}:",
        "",
        body.post_text,
    ]
    if body.extra_instruction and body.extra_instruction.strip():
        user_lines.extend(["", "Additional instruction: " + body.extra_instruction.strip()])
    user_content = "\n".join(user_lines)

    try:
        client = Anthropic(api_key=api_key)
        message = client.messages.create(
            model=model,
            max_tokens=200,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not message.content:
        raise HTTPException(status_code=502, detail="Empty response from model")

    block = message.content[0]
    if block.type != "text":
        raise HTTPException(status_code=502, detail="Unexpected content block type")

    comment = (block.text or "").strip()
    if not comment:
        raise HTTPException(status_code=502, detail="Model returned empty comment")

    return {"comment": comment}
