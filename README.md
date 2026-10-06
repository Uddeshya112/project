# IntelliSchedule

Automated timetable generation and academic scheduling engine for educational institutions.

## ⚠️ Security Notice: Mandatory Password & Credential Rotation

> **CRITICAL SECURITY ADVISORY**:
> Previous revisions of this codebase included hardcoded plaintext default passwords (`ThaparInstitute@2026!`, `ThaparDemo@2026Test!`, etc.) in repository source files.
>
> **These credentials must be considered compromised.**
>
> If you have provisioned this repository or connected it to a Supabase project, the project administrator **must immediately rotate and reset all user credentials and API secret keys** in the Supabase Dashboard:
> 1. **User Passwords**: Navigate to Supabase Dashboard -> Authentication -> Users. Reset passwords or issue password recovery requests for all accounts.
> 2. **API Keys**: In Supabase Dashboard -> Project Settings -> API, verify that the `service_role` secret key has never been committed or exposed. If exposed, rotate the project API keys immediately.
> 3. **Environment Secrets**: Configure unique, cryptographically strong passwords via `SEED_USER_PASSWORD` and `DEMO_ACCOUNT_PASSWORD` environment variables in private secret managers.

## Setup and Installation

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run test suites:
   ```bash
   npm run lint
   npm test
   ```
4. Start development server:
   ```bash
   npm run dev
   ```
