// Where access requests go. Public sign-up is closed (backend routes/auth.js),
// so every "get started" path on the site becomes an email to the team instead.
export const ACCESS_EMAIL = 'rashid.bukhari143@gmail.com';

export const accessMailto =
  `mailto:${ACCESS_EMAIL}?subject=${encodeURIComponent('Access request: StrataBio Stability Platform')}`
  + `&body=${encodeURIComponent('Hello,\n\nI would like access to the StrataBio Stability Platform.\n\nName:\nOrganisation:\nWhat I would like to use it for:\n')}`;
