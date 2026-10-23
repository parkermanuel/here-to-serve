// Privacy policy and terms, in plain language. Shown at #/privacy and #/terms, in the website and the phone app.
// Have a lawyer read these before the App Store release (see SETUP.md).
const UPDATED = "October 23, 2026";
const CONTACT = "hello@parkermanuel.com";

export function privacyPage() {
  return `<h1>Privacy</h1><p class="sub">Last updated ${UPDATED}</p>
  <section class="panel"><h2>The short version</h2>
    <p>Here To Serve helps a church run its membership class. What you enter goes to that church's team, and only to them. We don't sell it, share it with other churches, or use it for ads.</p></section>
  <section class="panel"><h2>Who's responsible</h2>
    <p>Your church decides what to ask and who on its team can see your answers. Here To Serve (run by Parker Manuel, heretoserve.app) stores the information for your church. Questions about your answers? Ask your church first, or write to ${CONTACT}.</p></section>
  <section class="panel"><h2>What's collected</h2>
    <p><b>If you take a membership class:</b> your name, email and phone; your household (married or single, kids and their ages if you share them); your faith and baptism steps and whether you're in a group; how you found the church and where you've served; skills, passions and when you can serve; your answers to the 33 gift questions and the gift scores they produce; your decision to join or not yet, and when you checked each membership commitment; any prayer request you share; and notes your church's leaders write after your one-on-one.</p>
    <p><b>If you're on a church's team:</b> your email, name, access level and teams, and, if you turn on notifications in the phone app, a device token so we can send them.</p>
    <p>You must be 18 or older to take a class with Here To Serve.</p></section>
  <section class="panel"><h2>Who sees it</h2>
    <p><b>Administrators and Staff</b> at your church see your answers, gifts, notes and next steps. <b>Team Leads</b> see only people headed to their own team (name, contact, top gifts and when you can serve), plus, if they're helping with your class's one-on-ones, your card while that class is open. <b>Prayer requests</b> are seen only by people your church gives prayer access to. The church-wide snapshot shows counts, never names.</p></section>
  <section class="panel"><h2>Church software and spreadsheets</h2>
    <p>If your church connects its Planning Center or Breeze account (one at a time), Here To Serve sends your name, email, phone, top gifts, team, membership status, first Sunday and a short note about your decision to your church's account there, and reads its team lists to show who's serving. That company's own privacy policy then applies to the copy it holds. Your church can disconnect at any time.</p>
    <p>Your church's Administrators and Staff can also download a spreadsheet of the same details, plus your class answers, to keep in their own records. Prayer requests and leader notes are never included in these.</p></section>
  <section class="panel"><h2>Where it's kept</h2>
    <p>On Supabase (database and sign-in) in the United States. Each church's information is walled off from every other church's. Sign-in emails and, later, other emails are sent through an email provider. Phone notifications go through Apple's or Google's notification service and never include anyone's name.</p></section>
  <section class="panel"><h2>Your choices</h2>
    <p>Ask your church to show you, correct, or delete what you entered; an Administrator can delete it permanently. Church team members can delete their own account in the app under Account. To reach us directly: ${CONTACT}.</p></section>
  <section class="panel"><h2>Changes</h2><p>If this changes in a way that matters, we'll update the date at the top and tell churches.</p></section>`;
}

export function termsPage() {
  return `<h1>Terms</h1><p class="sub">Last updated ${UPDATED}</p>
  <section class="panel"><h2>Using Here To Serve</h2>
    <p>Here To Serve is a paid subscription for churches, priced by size, and every plan starts with a 30-day free trial you can cancel anytime. Use it to welcome people, help them find where they fit, and follow up well. Don't use it to collect information for anything else, and don't enter information about people who haven't agreed to share it.</p></section>
  <section class="panel"><h2>Churches</h2>
    <p>Each church is responsible for who it invites to its team, what access each person has, what it does with members' information, and answering members' requests to see or delete their information. Church content (logo, beliefs, teams) stays the church's.</p></section>
  <section class="panel"><h2>The gifts assessment</h2>
    <p>The gift questions are a starting point for a conversation, not a test with a right answer. Results and team suggestions are for a leader and a member to talk through together.</p></section>
  <section class="panel"><h2>No warranty</h2>
    <p>We work hard to keep Here To Serve running and your information safe, but it's provided as is. We're not liable for lost data or for decisions a church makes using it, to the extent the law allows.</p></section>
  <section class="panel"><h2>Ending</h2>
    <p>You can stop using it any time. We may suspend a church's account that misuses it. Questions: ${CONTACT}.</p></section>`;
}
