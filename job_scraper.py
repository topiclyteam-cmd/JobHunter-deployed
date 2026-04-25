import os
import requests

def fetch_jobs_from_jsearch(job_title: str, location: str) -> list:
    api_key = os.environ.get("RAPIDAPI_KEY")
    if not api_key:
        raise Exception("RAPIDAPI_KEY environment variable is not set.")

    url = "https://jsearch.p.rapidapi.com/search"
    query = f"{job_title} in {location}"
    
    querystring = {"query": query, "page": "1", "num_pages": "1"}

    headers = {
        "x-rapidapi-key": api_key,
        "x-rapidapi-host": "jsearch.p.rapidapi.com"
    }

    response = requests.get(url, headers=headers, params=querystring)
    
    if response.status_code != 200:
        raise Exception(f"Failed to fetch jobs from API: {response.text}")
        
    data = response.json()
    jobs_list = data.get("data", [])
    
    results = []
    for job in jobs_list[:15]:
        city = job.get("job_city") or ""
        country = job.get("job_country") or ""
        location = f"{city}, {country}".strip(", ")
        
        results.append({
            "job_title": job.get("job_title"),
            "company_name": job.get("employer_name"),
            "location": location or "Unknown",
            "job_description": job.get("job_description"),
            "job_url": job.get("job_apply_link") or job.get("job_google_link")
        })
        
    return results
