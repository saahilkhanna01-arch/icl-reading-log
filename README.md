# Interschool Corner of Learning: reading log website

This folder is the whole website. Putting it online takes about 30 minutes the first time and uses four free accounts. A Gmail address works for all of them.

| Service | What it does | Cost |
| --- | --- | --- |
| Supabase | Saves tutors, kids and reading results so every tutor sees the same log | Free |
| Groq | The AI for extra practice stories and end-of-lesson notes | Free |
| GitHub | Holds these files | Free |
| Vercel | Puts the website online and keeps the Groq key hidden | Free |

Want to look around first? Double-click `index.html`. It opens in your browser and saves to that computer only. The AI only works once the site is online.

---

## Step 1: Make the database (Supabase)

1. Go to **supabase.com** and click **Start your project**. Sign in with GitHub or Google.
2. Click **New project**. Name it `icl-reading-log`, make up a database password (you won't need it again), pick the region closest to Ontario (for example Canada Central), and click **Create new project**. Wait a minute or two.
3. In the left menu, open **SQL Editor**, then **New query**.
4. Open `setup.sql` from this folder in Notepad or TextEdit, copy everything, paste it into Supabase, and click **Run**. You should see "Success".
5. In the left menu, open **Project Settings**, then **API** (it may be called **Data API** or **API Keys**). Copy two things:
   - the **Project URL** (looks like `https://abcd1234.supabase.co`)
   - the **anon public** key (it may be called the **publishable** key). It's long, and it's fine to share it.
6. Open `config.js` from this folder in Notepad or TextEdit, paste them between the quotes, and save:

```js
window.ICL_CONFIG = {
  supabaseUrl: "https://abcd1234.supabase.co",
  supabaseAnonKey: "paste-the-long-key-here",
};
```

## Step 2: Get the AI key (Groq)

1. Go to **console.groq.com** and sign in.
2. Open **API Keys**, then click **Create API Key**. Name it `icl`.
3. Copy the key (it starts with `gsk_`) and keep it somewhere safe for Step 4. Don't put it in any of these files.

## Step 3: Upload the files (GitHub)

1. Go to **github.com** and create an account.
2. Click the **+** at the top right, then **New repository**. Name it `icl-reading-log`, choose **Private**, and click **Create repository**.
3. On the next page, click **uploading an existing file**.
4. Open this folder on your computer, select **everything inside it** (including the `api` and `vendor` folders), and drag it all onto the GitHub page.
5. Wait for the uploads to finish, then click **Commit changes**.

Check that the repository shows `index.html` and the `api` folder at the top level, not inside another folder.

## Step 4: Put it online (Vercel)

1. Go to **vercel.com** and sign up with your GitHub account (choose the free **Hobby** plan).
2. Click **Add New**, then **Project**. Find `icl-reading-log` and click **Import**.
3. Leave **Framework Preset** as **Other** and the other build settings empty.
4. Open **Environment Variables** and add:
   - Key: `GROQ_API_KEY`
   - Value: the `gsk_` key from Step 2
5. Click **Deploy**. After a minute you get a link like `icl-reading-log.vercel.app`.

If you added the key after the first deploy, go to **Deployments**, open the **⋯** menu on the latest one and click **Redeploy** so the site picks it up.

## Step 5: First visit

1. Open your link, click **Admin**, and enter the password `corner2026`.
2. Change the password straight away (bottom of the Admin page).
3. Add your tutors, or let them add themselves on Sunday.
4. Send the link to your tutors.

---

## Each week

- **On Sunday:** tutors sign in, pick their kids, start the lesson, and end with notes for next week.
- **Any time:** download everything as a spreadsheet from Admin.

## Changing something later

Edit or replace a file on GitHub (open the file, click the pencil, save). Vercel updates the website on its own within a minute.

## If something goes wrong

- **"Trying it out: the database isn't connected"**: `config.js` is still empty on GitHub. Fill it in (Step 1, part 6) and upload it again.
- **"Can't reach the class log"**: the Supabase URL or key in `config.js` has a typo, or `setup.sql` wasn't run.
- **"The AI isn't set up yet"**: add `GROQ_API_KEY` in Vercel, then redeploy.
- **"The free AI limit is used up"**: Groq's free plan allows roughly 30 requests a minute and 1,000 a day. Wait a minute and try again.
- **Stories stop working one day**: Groq may have retired the model. In Vercel, add `GROQ_MODEL` set to a current model name from console.groq.com/docs/models, then redeploy.
- **Supabase project paused**: free projects pause after about a week with no use. Log in to Supabase and click **Restore**. Using the site every Sunday keeps it awake.

## Google sign-in

Tutors sign in with Google and go straight in. Their name comes from their Google account. Only the Google account(s) listed in `setup-signin.sql` can open Admin.

To turn it on: switch on Google in Supabase (Authentication > Providers), put your Google email in `setup-signin.sql`, and run it in the SQL Editor. Once that's run, nobody can read or change the log without signing in with Google.

## Good to know

- Use kids' first names (plus a last initial if two share a name).
- The library has 240 stories, 20 per level, each with 3 questions. They're in the `library` folder, one file per level.
- Tutors can also make an AI practice story built around a kid's missed words. These show up in the kid's story list and can be deleted from Admin.
- Story levels follow the UFLI Foundations order. The lesson ranges are approximate, so check them against your UFLI manual.
