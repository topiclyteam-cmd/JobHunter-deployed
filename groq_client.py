import json
from groq import Groq

def parse_cv_with_groq(extracted_cv_text: str) -> dict:
    client = Groq() # reads GROQ_API_KEY from environment
    completion = client.chat.completions.create(
        model='openai/gpt-oss-120b',
        messages=[
            {
                'role': 'system',
                'content': (
                    'You are a CV parser. Extract the following fields '
                    'and return them as a JSON object with no extra text: '
                    'full_name, current_job_title, years_of_experience (number), '
                    'technical_skills (array of strings), '
                    'professional_summary (two sentences max).'
                )
            },
            { 'role': 'user', 'content': extracted_cv_text }
        ],
        temperature=1,
        max_completion_tokens=1024,
        top_p=1,
        reasoning_effort='medium',
        stream=True,
        stop=None
    )
    full_response = ''
    for chunk in completion:
        full_response += chunk.choices[0].delta.content or ''
    
    # Clean up response if it contains markdown formatting
    clean_json = full_response.strip()
    if clean_json.startswith('```json'):
        clean_json = clean_json[7:-3]
    elif clean_json.startswith('```'):
        clean_json = clean_json[3:-3]
        
    parsed_profile = json.loads(clean_json.strip())
    return parsed_profile

from groq import AsyncGroq
import asyncio

async def score_job_match(profile_text: str, job_description: str) -> int:
    client = AsyncGroq()
    
    completion = await client.chat.completions.create(
        model='openai/gpt-oss-120b',
        messages=[
            {
                'role': 'system',
                'content': (
                    'You are a recruitment assistant. Given the candidate profile '
                    'and the job description, return a match score as a JSON object '
                    'with a single key called score. The score is an integer 0 to 100. '
                    'Return only the JSON object. No explanation.'
                )
            },
            {
                'role': 'user',
                'content': f'Profile: {profile_text}\n\nJob: {job_description}'
            }
        ],
        temperature=1,
        max_completion_tokens=150,
        top_p=1,
        reasoning_effort='medium',
        stream=True,
        stop=None
    )
    
    full_response = ''
    async for chunk in completion:
        full_response += chunk.choices[0].delta.content or ''
        
    clean_json = full_response.strip()
    if clean_json.startswith('```json'):
        clean_json = clean_json[7:-3]
    elif clean_json.startswith('```'):
        clean_json = clean_json[3:-3]
        
    result = json.loads(clean_json.strip())
    return result.get('score', 0)
