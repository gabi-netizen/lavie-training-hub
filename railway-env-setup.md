# Railway Environment Variables

Copy these into your Railway web service → Variables tab.

## Required Variables

```
DATABASE_URL=mysql://root:ruZQQaMfCgMKvgCpKOMqcEEknqkrxrzu@mysql.railway.internal:3306/railway
NODE_ENV=production
JWT_SECRET=cd6f6e2e87b8ea172eb0e09d34d54097e9a397ed78908f881af7565fbcaff0c5

# Clerk Authentication
CLERK_SECRET_KEY=sk_test_1d6mRB8baZg0urlO3YfPRGqcxnyD52wcXEIqDIBx84
VITE_CLERK_PUBLISHABLE_KEY=pk_test_Y2FyaW5nLWR1Y2stOTguY2xlcmsuYWNjb3VudHMuZGV2JA

# OpenAI
OPENAI_API_KEY=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

# CloudTalk
CLOUDTALK_API_KEY_ID=FWK07WNVLBO@LVITAPZYLVI
CLOUDTALK_API_KEY_SECRET=VSblM64so.Wort7niA8KMKRS7EHGO@fPVJ86Cs880HmJE

# Postmark Email
POSTMARK_API_KEY=f8d7dddf-68c1-4621-8881-13923bb57b7f

# Cloudflare R2 Storage
AWS_ACCESS_KEY_ID=712606a7345da7a4acedde6c412d9fd8
AWS_SECRET_ACCESS_KEY=81d46cb21da9eb085fa975ee126170ce3f3a83420406b6000d7699d468b15560
AWS_S3_BUCKET=lavie-training-hub
AWS_ENDPOINT_URL=https://8b2e1ccac56936d978ee48e85861a6e4.r2.cloudflarestorage.com
AWS_REGION=auto
```

## Notes
- DATABASE_URL uses the internal Railway MySQL URL (mysql.railway.internal) — this only works inside Railway's network
- JWT_SECRET is a randomly generated secure key — do not share it
- AWS_* variables are for Cloudflare R2 (compatible with AWS S3 SDK)
