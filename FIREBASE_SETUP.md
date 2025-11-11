# Firebase Setup Instructions

This app uses **Firebase only** (no Supabase) for authentication and data storage.

## Quick Setup

1. **Create a Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Click "Add project" or use existing project
   - Follow the setup wizard

2. **Enable Firestore Database**
   - In Firebase Console, go to "Firestore Database"
   - Click "Create database"
   - Choose "Start in production mode"
   - Select your region

3. **Enable Authentication**
   - Go to "Authentication" > "Sign-in method"
   - Enable "Email/Password"
   - (Optional) Enable "Google" for Google Sign-In

4. **Get Your Config**
   - Go to Project Settings (gear icon)
   - Scroll to "Your apps" section
   - Click the web icon `</>`
   - Copy the `firebaseConfig` object

5. **Update `src/lib/firebase.ts`**
   - Replace the `firebaseConfig` object with your own values
   - Keep the existing auth and db exports

## Firestore Security Rules

Set these rules in Firebase Console > Firestore Database > Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /meetings/{meetingId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.userId;
    }
    
    match /folders/{folderId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.userId;
    }
  }
}
```

## Data Structure

### Meetings Collection
```typescript
{
  title: string;
  transcript: string;
  protocol: string;
  folder: string;
  userId: string;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Folders Collection
```typescript
{
  name: string;
  userId: string;
  order: number;
  createdAt: string;
}
```

## Performance Tips

- Firestore has built-in caching - data loads fast offline
- The app uses indexes automatically created by Firestore
- Consider adding composite indexes if you see warnings in console

## Cost Optimization

Firebase Free Tier includes:
- 50,000 document reads/day
- 20,000 document writes/day
- 1 GB storage
- 10 GB/month network egress

This is plenty for personal use!

## Support

For Firebase help, see:
- [Firebase Docs](https://firebase.google.com/docs)
- [Firestore Guides](https://firebase.google.com/docs/firestore)
