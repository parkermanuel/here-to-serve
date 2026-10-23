// Every Breeze ChMS address and name this app depends on, in one place.
// Breeze's API: https://app.breezechms.com/api (each church: https://<subdomain>.breezechms.com/api, header "Api-Key").
// Items marked CONFIRM were written from Breeze's published API notes without a live account to check against:
// confirm each with one test call on a real Breeze account before the first real sync. If one is wrong, fix it here only.

export const base = (subdomain) => `https://${subdomain}.breezechms.com/api`;
export const KEY_HEADER = "Api-Key";
export const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// CONFIRM: Breeze's documented limit is low (about 20 requests a minute per church). We stay at that and back off on 429.
export const RATE = { requests: 20, perMs: 60_000 };
export const PAGE_SIZE = 1000;

const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)).toString();
export const PATH = {
  // CONFIRM: returns the church's account name; used for "Test connection".
  account: "/account/summary",
  people: (offset) => `/people?${q({ details: 1, limit: PAGE_SIZE, offset })}`,
  person: (id) => `/people/${encodeURIComponent(id)}?${q({ details: 1 })}`,
  // CONFIRM: fields_json is a JSON list of {field_id, field_type, response, details}.
  addPerson: (first, last, fields) => `/people/add?${q({ first, last, fields_json: fields ? JSON.stringify(fields) : undefined })}`,
  updatePerson: (id, fields) => `/people/update?${q({ person_id: id, fields_json: JSON.stringify(fields) })}`,
  profileFields: "/profile",
  folders: "/tags/list_folders",
  // CONFIRM: adding a tag folder.
  addFolder: (name) => `/tags/add_folder?${q({ name })}`,
  tags: (folderId) => `/tags/list_tags?${q({ folder_id: folderId })}`,
  addTag: (name, folderId) => `/tags/add_tag?${q({ name, folder_id: folderId })}`,
  assign: (personId, tagId) => `/tags/assign?${q({ person_id: personId, tag_id: tagId })}`,
  unassign: (personId, tagId) => `/tags/unassign?${q({ person_id: personId, tag_id: tagId })}`,
  // CONFIRM: people with a tag, using filter_json {"tag_contains": "y_<tag id>"}.
  peopleWithTag: (tagId, offset) => `/people?${q({ limit: PAGE_SIZE, offset, filter_json: JSON.stringify({ tag_contains: `y_${tagId}` }) })}`,
  // CONFIRM: Breeze may not offer notes through its API. If this fails, the sync skips the note and carries on;
  // the decision is still recorded with the "Member" / "Not ready yet" tag.
  addNote: (personId, note) => `/people/add_note?${q({ person_id: personId, note })}`,
};

// The tag folder and tags this app adds to each church's Breeze
export const FOLDER_NAME = "Here To Serve";
export const TAG = {
  member: "Member",
  notReady: "Not ready yet",
  gift: (g) => `Gift: ${g}`,
  team: (t) => `Team: ${t}`,
};
