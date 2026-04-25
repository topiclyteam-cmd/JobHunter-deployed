import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import json
import traceback

from database import engine, Base, get_db
from models import UserProfile, JobListing
from pdf_parser import extract_text_from_pdf
from groq_client import parse_cv_with_groq, score_job_match
from job_scraper import fetch_jobs_from_jsearch
import asyncio

Base.metadata.create_all(bind=engine)

app = FastAPI(title="JobRadar")

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.post("/api/upload-cv")
async def upload_cv(
    session_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    try:
        contents = await file.read()
        extracted_text = extract_text_from_pdf(contents)
        
        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from the PDF. It might be scanned or empty.")
            
        truncated_cv = extracted_text[:1500]
        parsed_data = parse_cv_with_groq(truncated_cv)
        
        # Save to database
        profile = UserProfile(
            session_id=session_id,
            full_name=parsed_data.get('full_name'),
            current_job_title=parsed_data.get('current_job_title'),
            years_of_experience=parsed_data.get('years_of_experience'),
            technical_skills=json.dumps(parsed_data.get('technical_skills', [])),
            professional_summary=parsed_data.get('professional_summary')
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        
        return {
            "success": True, 
            "profile": {
                "full_name": profile.full_name,
                "current_job_title": profile.current_job_title,
                "years_of_experience": profile.years_of_experience,
                "technical_skills": json.loads(profile.technical_skills) if profile.technical_skills else [],
                "professional_summary": profile.professional_summary
            }
        }
        
    except Exception as e:
        traceback.print_exc()
        if 'groq' in str(e).lower() or 'api' in str(e).lower() or 'auth' in str(e).lower() or '401' in str(e):
             raise HTTPException(status_code=401, detail="Invalid or missing Groq API Key. Please click the gear icon (Settings) to add your valid API key.")
        raise HTTPException(status_code=500, detail=f"AI parsing failed. Please try again or check the format of your CV. Detail: {str(e)}")

@app.post("/api/fetch-jobs")
async def fetch_jobs(
    session_id: str = Form(...),
    job_title: str = Form(...),
    location: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        jobs_data = fetch_jobs_from_jsearch(job_title, location)
        
        # Clear previous jobs for this session
        db.query(JobListing).filter(JobListing.session_id == session_id).delete()
        
        db_jobs = []
        for job in jobs_data:
            db_job = JobListing(
                session_id=session_id,
                job_title=job['job_title'],
                company_name=job['company_name'],
                location=job['location'],
                job_description=job['job_description'],
                job_url=job['job_url']
            )
            db.add(db_job)
            
        db.commit()
        
        # After commit, db_job.id is populated
        jobs_result = db.query(JobListing).filter(JobListing.session_id == session_id).all()
        for j in jobs_result:
            db_jobs.append({
                "id": j.id,
                "job_title": j.job_title,
                "company_name": j.company_name,
                "location": j.location,
                "job_description": j.job_description,
                "job_url": j.job_url
            })
        
        return {"success": True, "jobs": db_jobs}
    except Exception as e:
        traceback.print_exc()
        if '403' in str(e) or 'api' in str(e).lower() or 'forbidden' in str(e).lower() or 'unauthorized' in str(e).lower():
            raise HTTPException(status_code=403, detail="Invalid or missing RapidAPI Key. Please click the gear icon (Settings) to add your valid key.")
        raise HTTPException(status_code=500, detail=f"Failed to fetch jobs from LinkedIn. Please try another search. Detail: {str(e)}")

@app.post("/api/score-jobs")
async def score_jobs(
    session_id: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        profile = db.query(UserProfile).filter(UserProfile.session_id == session_id).order_by(UserProfile.id.desc()).first()
        if not profile:
            raise HTTPException(status_code=400, detail="No CV profile found. Please upload a CV first.")
            
        profile_text = f"Name: {profile.full_name}\nTitle: {profile.current_job_title}\nExperience: {profile.years_of_experience} years\nSkills: {profile.technical_skills}\nSummary: {profile.professional_summary}"
        
        jobs = db.query(JobListing).filter(JobListing.session_id == session_id).all()
        if not jobs:
            return {"success": True, "scores": {}}
            
        async def score_single_job(job):
            truncated_jd = job.job_description[:400] if job.job_description else ""
            score = await score_job_match(profile_text, truncated_jd)
            job.match_score = score
            return job.id, score

        tasks = [score_single_job(job) for job in jobs]
        results = await asyncio.gather(*tasks)
        
        db.commit()
        
        scores_dict = {job_id: score for job_id, score in results}
        return {"success": True, "scores": scores_dict}
        
    except Exception as e:
        traceback.print_exc()
        if 'groq' in str(e).lower() or 'api' in str(e).lower() or 'auth' in str(e).lower() or '401' in str(e):
             raise HTTPException(status_code=401, detail="Invalid or missing Groq API Key. Please click the gear icon (Settings) to add your valid API key.")
        raise HTTPException(status_code=500, detail=f"Failed to score jobs. Detail: {str(e)}")

from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TrackJobRequest(BaseModel):
    session_id: str
    job_title: str
    company_name: str
    match_score: Optional[int] = 0
    job_url: Optional[str] = ""
    status: str = "Applied"

@app.post("/api/track-job")
async def track_job(
    request: TrackJobRequest,
    db: Session = Depends(get_db)
):
    from models import TrackedJob
    try:
        existing = db.query(TrackedJob).filter(
            TrackedJob.session_id == request.session_id,
            TrackedJob.job_url == request.job_url
        ).first()
        
        if existing:
            existing.status = request.status
            existing.last_moved = datetime.utcnow()
        else:
            new_job = TrackedJob(
                session_id=request.session_id,
                job_title=request.job_title,
                company_name=request.company_name,
                match_score=request.match_score,
                job_url=request.job_url,
                status=request.status,
                last_moved=datetime.utcnow()
            )
            db.add(new_job)
            
        db.commit()
        return {"success": True}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tracker-jobs")
async def get_tracker_jobs(
    session_id: str,
    db: Session = Depends(get_db)
):
    from models import TrackedJob
    try:
        jobs = db.query(TrackedJob).filter(TrackedJob.session_id == session_id).all()
        return {
            "success": True,
            "jobs": [
                {
                    "id": j.id,
                    "job_title": j.job_title,
                    "company_name": j.company_name,
                    "match_score": j.match_score,
                    "job_url": j.job_url,
                    "status": j.status,
                    "last_moved": j.last_moved.isoformat() if j.last_moved else None
                }
                for j in jobs
            ]
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class UpdateStatusRequest(BaseModel):
    status: str

@app.put("/api/tracker-jobs/{job_id}")
async def update_tracker_job_status(
    job_id: int,
    request: UpdateStatusRequest,
    db: Session = Depends(get_db)
):
    from models import TrackedJob
    try:
        job = db.query(TrackedJob).filter(TrackedJob.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Tracked job not found")
            
        job.status = request.status
        job.last_moved = datetime.utcnow()
        db.commit()
        
        return {"success": True, "last_moved": job.last_moved.isoformat()}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class SettingsRequest(BaseModel):
    groq_api_key: str
    rapidapi_key: str

@app.post("/api/settings")
async def update_settings(request: SettingsRequest):
    try:
        if request.groq_api_key:
            os.environ["GROQ_API_KEY"] = request.groq_api_key
        if request.rapidapi_key:
            os.environ["RAPIDAPI_KEY"] = request.rapidapi_key
            
        with open(".env", "w") as f:
            f.write(f"GROQ_API_KEY={os.environ.get('GROQ_API_KEY', '')}\n")
            f.write(f"RAPIDAPI_KEY={os.environ.get('RAPIDAPI_KEY', '')}\n")
            
        return {"success": True}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")

@app.get("/")
def read_root():
    return FileResponse("static/index.html")
