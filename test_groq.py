import asyncio, json
from groq import Groq
def test():
    client = Groq()
    comp = client.chat.completions.create(model='openai/gpt-oss-120b', messages=[{'role': 'user', 'content': 'Profile: Dev\nJob: Dev\nReturn json {"score": 100}'}], max_completion_tokens=150, stream=False)
    print("RAW:", repr(comp.choices[0].message.content))
test()
