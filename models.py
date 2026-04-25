from sqlalchemy import Column, Integer, String, Text, DateTime
from database import Base
from datetime import datetime

class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True)
    full_name = Column(String, nullable=True)
    current_job_title = Column(String, nullable=True)
    years_of_experience = Column(Integer, nullable=True)
    technical_skills = Column(Text, nullable=True) # Stored as JSON string
    professional_summary = Column(Text, nullable=True)

class JobListing(Base):
    __tablename__ = "job_listings"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True)
    job_title = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    location = Column(String, nullable=True)
    job_description = Column(Text, nullable=True)
    job_url = Column(String, nullable=True)
    match_score = Column(Integer, nullable=True)

class TrackedJob(Base):
    __tablename__ = "tracked_jobs"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True)
    job_title = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    match_score = Column(Integer, nullable=True)
    job_url = Column(String, nullable=True)
    status = Column(String, default="Saved")
    last_moved = Column(DateTime, default=datetime.utcnow)
