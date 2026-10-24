// Every question, gift, team default, commitment and belief line. Saved answers are stored by ID,
// so never reuse an ID for different wording.

export const GIFTS = {
  sh: "Shepherding", te: "Teaching", me: "Mercy", le: "Leadership", en: "Encouragement", he: "Helps",
  ad: "Administration", fa: "Faith", ho: "Hospitality", ev: "Evangelism", gi: "Giving",
};
export const GIFT_KEYS = Object.keys(GIFTS);
export const VERSES = {
  sh: "Ephesians 4:11", te: "Ephesians 4:11", me: "Romans 12:8", le: "Romans 12:8", en: "Romans 12:8",
  he: "1 Corinthians 12:28", ad: "1 Corinthians 12:28", fa: "1 Corinthians 12:9", ho: "1 Peter 4:9",
  ev: "Ephesians 4:11", gi: "Romans 12:8",
};

// 33 "Which sounds more like you?" pairs: [A text, A gift, B text, B gift]. Each gift appears 6 times.
// Must match hts_pairs() in supabase/setup.sql (the server re-counts from the picks).
export const PAIRS = [
  ["I check in on people when they've been missing for a while.", "sh", "I love explaining what a Bible passage means.", "te"],
  ["I enjoy studying and then helping others understand it.", "te", "People come to me when they're hurting.", "me"],
  ["I feel deeply for people who are struggling.", "me", "People tend to follow when I set a direction.", "le"],
  ["I can see where a group needs to go and rally people toward it.", "le", "I often send a text to lift someone up.", "en"],
  ["People leave conversations with me feeling more hopeful.", "en", "I notice what needs to get done and just do it.", "he"],
  ["I'm happy to serve behind the scenes without any credit.", "he", "I love creating systems that make things run smoothly.", "ad"],
  ["I enjoy planning the details of an event.", "ad", "I trust God for big things others think are impossible.", "fa"],
  ["I keep praying long after others would give up.", "fa", "I love making a first-time guest feel at home.", "ho"],
  ["I enjoy having people over for a meal.", "ho", "I find myself telling friends about Jesus.", "ev"],
  ["I'm comfortable talking about faith with people who don't believe.", "ev", "I look for ways to give generously when I see a need.", "gi"],
  ["I enjoy giving quietly, without anyone knowing.", "gi", "I want to walk with a small group of people over the long haul.", "sh"],
  ["I notice when someone is drifting spiritually and want to help.", "sh", "I'd rather sit with someone in a hard moment than fix it fast.", "me"],
  ["People tell me I make hard ideas simple.", "te", "I'm comfortable making the call when a decision needs to be made.", "le"],
  ["I'm drawn to people others overlook.", "me", "I notice what people do well and tell them.", "en"],
  ["I enjoy recruiting and developing other people.", "le", "I'd rather carry chairs than speak in front of people.", "he"],
  ["I can challenge someone to keep going without making them feel judged.", "en", "Checklists, schedules and spreadsheets energize me.", "ad"],
  ["I like practical, hands-on work.", "he", "Prayer feels like one of the most natural things I do.", "fa"],
  ["I can see the steps needed to get from idea to done.", "ad", "I notice the person standing alone and go talk to them.", "ho"],
  ["In uncertain times, I'm steady because I trust God.", "fa", "I have a lot of friends who don't know Jesus yet.", "ev"],
  ["I remember names and details about people.", "ho", "I manage my money so I can give more.", "gi"],
  ["I love inviting people to church.", "ev", "I enjoy helping someone grow in their walk with Jesus, step by step.", "sh"],
  ["Meeting someone's practical need with my resources brings me joy.", "gi", "I get excited preparing a lesson or devotional.", "te"],
  ["Kids or students feel safe and cared for around me.", "sh", "When no one is leading, I step in.", "le"],
  ["I notice when something taught isn't quite accurate.", "te", "I bring energy to a room or a team.", "en"],
  ["Sitting with someone in the hospital or a hard season comes naturally to me.", "me", "I show up early and stay late to make things work.", "he"],
  ["I think about the big picture and the next season.", "le", "I like making sure everything is ready before people arrive.", "ad"],
  ["I'm quick to point people to God's promises when they're discouraged.", "en", "I find myself praying for people the moment they share a need.", "fa"],
  ["When something breaks, I'm the one who fixes it.", "he", "I want every room I'm in to feel warm and welcoming.", "ho"],
  ["I notice when things are disorganized and want to fix the process.", "ad", "I feel burdened for people who are far from God.", "ev"],
  ["I'm drawn to times of worship and prayer where God moves.", "fa", "I'd rather fund a mission than lead it.", "gi"],
  ["Meeting new people energizes me.", "ho", "I'd rather know a few people deeply than many people a little.", "sh"],
  ["I like sharing my story of how I met Jesus.", "ev", "I like helping people connect the Bible to everyday life.", "te"],
  ["I think about how my money can advance God's kingdom.", "gi", "I'm patient with people who are going through a mess.", "me"],
];

// Pinewood's teams: the default list each church edits. check = needs a background check.
export const DEFAULT_TEAMS = [
  { name: "Outreach", gifts: ["ev", "me", "le"], boosts: ["Our city", "People far from God"], check: false },
  { name: "Prayer", gifts: ["fa", "me", "en"], boosts: ["Prayer", "The hurting"], check: false },
  { name: "Worship", gifts: ["fa", "en"], boosts: ["Music or vocals", "Worship"], check: false },
  { name: "Connect", gifts: ["ho", "en", "ev"], boosts: ["Cooking or hosting", "Welcoming new people"], check: false },
  { name: "Kids", gifts: ["sh", "te", "he"], boosts: ["Kids"], check: true },
  { name: "Youth", gifts: ["sh", "te", "en"], boosts: ["Students"], check: true },
  { name: "AVL", gifts: ["he", "ad"], boosts: ["Tech or AV", "Design or social media"], check: false },
  { name: "Set up and tear down", gifts: ["he", "ad", "le"], boosts: ["Trades or building"], check: false },
  { name: "Security", gifts: ["he", "le"], boosts: ["Military or law enforcement", "Medical"], check: true },
];

export const PASSION_GIFT = {
  Kids: "sh", Students: "sh", "The hurting": "me", "People far from God": "ev", Worship: "fa", Prayer: "fa",
  "Welcoming new people": "ho", "Our city": "ev",
};

// Part 1 choices (single = one answer, multi = tap all)
export const CHOICES = {
  married: ["Single", "Married"],
  kids: ["No kids", "1", "2", "3", "4+"],
  faith: ["Yes", "Not yet", "Not sure"],
  bapt: ["Yes", "Not yet", "I'd like to talk about it"],
  group: ["Yes", "No", "Interested"],
  found: ["A friend invited me", "Online or social media", "Drove by", "An event", "Other"],
  served: ["Yes", "No"],
  skills: ["Music or vocals", "Tech or AV", "Teaching", "Medical", "Military or law enforcement", "Trades or building", "Admin", "Design or social media", "Cooking or hosting"],
  passions: ["Kids", "Students", "The hurting", "People far from God", "Worship", "Prayer", "Welcoming new people", "Our city"],
  when: ["Sundays", "Midweek", "Both", "My season is full right now"],
  often: ["Weekly", "Every other week", "Monthly"],
};
export const SEASON_FULL = "My season is full right now";

export const DEFAULT_COMMITMENTS = [
  { k: "faith", word: "Faith", statement: "I have trusted Jesus and been baptized as a believer.", verse: "Romans 10:9; Acts 2:41" },
  { k: "belief", word: "Belief", statement: "I affirm what our church believes.", verse: "2 Timothy 1:13" },
  { k: "gather", word: "Gather", statement: "I will gather faithfully with our church and a group.", verse: "Hebrews 10:24–25" },
  { k: "serve", word: "Serve", statement: "I will serve faithfully with the gifts God gave me.", verse: "1 Peter 4:10" },
  { k: "give", word: "Give", statement: "I will give generously toward the mission.", verse: "2 Corinthians 9:7" },
  { k: "unity", word: "Unity", statement: "I will protect the unity of our church.", verse: "Ephesians 4:3" },
  { k: "pray", word: "Pray", statement: "I will pray for our church and its leaders.", verse: "Ephesians 6:18" },
  { k: "invite", word: "Invite", statement: "I will invite others to meet Jesus.", verse: "Matthew 28:19" },
];

// Pinewood's beliefs, condensed from Article III of its bylaws (communion for every believer, by Parker's practice).
export const PINEWOOD_BELIEFS = [
  { word: "Scripture", text: "The Bible is God's inspired Word, totally true and trustworthy, and the standard for all we believe.", verse: "2 Timothy 3:15–17" },
  { word: "God", text: "There is one living and true God, eternally Father, Son and Holy Spirit.", verse: "Deuteronomy 6:4; Matthew 28:19" },
  { word: "Jesus", text: "Jesus is fully God and fully man. He was born of a virgin, died for our sins, rose from the dead and will return.", verse: "1 Corinthians 15:3–4" },
  { word: "Holy Spirit", text: "The Spirit brings new birth, lives in every believer and gives spiritual gifts to serve the church.", verse: "1 Corinthians 12:4–11" },
  { word: "People", text: "Every person is made in God's image, has sinned, and needs God's grace.", verse: "Genesis 1:27; Romans 3:23" },
  { word: "Salvation", text: "Salvation is a free gift for all who repent and trust Jesus as Lord. God keeps true believers to the end.", verse: "Romans 10:9–10; John 10:27–29" },
  { word: "Baptism & Lord's Supper", text: "Baptism is the immersion of a believer, a picture of new life in Jesus. The Lord's Supper is for every believer, remembering his death and looking to his return.", verse: "Romans 6:3–5; 1 Corinthians 11:23–26" },
  { word: "The Church", text: "The church is a local family of baptized believers, using their gifts to take the gospel to the world.", verse: "Acts 2:41–42" },
  { word: "Mission", text: "Every follower of Jesus is called to make disciples of all nations.", verse: "Matthew 28:18–20" },
  { word: "Stewardship", text: "All we have belongs to God. We give cheerfully, regularly and generously.", verse: "2 Corinthians 9:6–7" },
  { word: "Family", text: "Marriage is one man and one woman for life. Every life is sacred, from conception to natural death.", verse: "Genesis 2:24; Psalm 139:13–16" },
  { word: "Last Things", text: "Jesus will return visibly, raise the dead and judge the world. His people will live with him forever.", verse: "1 Thessalonians 4:14–18" },
];

// Three access levels, highest first
export const ROLE_NAMES = { admin: "Administrator", staff: "Staff", team_lead: "Team Lead" };

// ---------- Running the class (owner, 23 Oct 2026) ----------
// The lead pastor teaches by recorded video; the host runs the rest, cues the video, pairs the one-on-ones and closes.
// Each church can rewrite these in Settings. {join} becomes the church's own words for joining.
export const DEFAULT_JOIN_TERM = "join the serve team";
export const DEFAULT_HOST_SCRIPT = `Welcome | Put the class code on the screen and welcome people as they arrive. Thank them for coming and tell them what's ahead: a short form, a video from our lead pastor, a gifts assessment, and a one-on-one with a leader.
Part 1 | Ask everyone to scan the code with their phone camera and fill out Part 1. It takes about 7 minutes. Walk the room and help anyone who's stuck. Point anyone who can't scan to the typed code.
The video | When most phones show "Part 1 is done", play the lead pastor's video.
Part 2 | Ask everyone to start Part 2, the gifts assessment. It takes 8 to 10 minutes. Remind them to go with their gut.
One-on-ones | Pair each person with a leader (on the class page). Leaders sit with them, go over their results, and ask for their story.
Next steps | After the one-on-one, each person taps "I'm ready to {join}" or "I'm not ready yet", then Submit. Both answers are good ones.
Close | Thank everyone, tell them someone will reach out this week, and close in prayer.`;
export const DEFAULT_GUIDE = `Ask | "Would you share your testimony?" or "Would you tell me your story and church background?"
Listen for | A clear trust in Jesus. Believer's baptism (if not yet, talk about it as their next step). Any consistent, unrepentant sin. Note it with grace and let a pastor follow up.
Go over | Their top gifts and the teams on their screen. Agree on one team to try, and adjust it on their card if it doesn't fit.
Write down | Anything a pastor should know, as a note on their card. Notes stay with your church team.`;
// "Title | text" lines into [{title, text}]
export const lines = (t) => String(t || "").split("\n").map((l) => l.split("|")).filter((p) => p[0]?.trim() && p[1]?.trim()).map(([a, ...b]) => ({ title: a.trim(), text: b.join("|").trim() }));
