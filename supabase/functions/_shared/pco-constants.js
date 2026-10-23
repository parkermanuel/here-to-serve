// Every Planning Center address and name this app depends on, in one place.
// Planning Center's API is JSON:API (https://developer.planning.center/docs). Items marked CONFIRM were written
// from the published docs without a live account to check against: confirm each against the docs (or one test
// call) before the first real sync. If one is wrong, fix it here only.

export const PCO_HOST = "https://api.planningcenteronline.com";
export const AUTHORIZE_URL = PCO_HOST + "/oauth/authorize";
export const TOKEN_URL = PCO_HOST + "/oauth/token";
export const SCOPES = "people services";

// Rate limit: Planning Center allows about 100 requests per 20 seconds per app per organization.
// On a 429 it sends Retry-After (seconds). We pace ourselves under the limit and honor Retry-After.
export const RATE = { requests: 90, perMs: 20_000 };
export const PAGE_SIZE = 100; // per_page maximum for most endpoints

export const PATH = {
  organization: "/people/v2", // returns the Organization (name, id)
  // CONFIRM: search filter name. Docs list where[search_name_or_email] on /people/v2/people.
  searchPeople: (q) => `/people/v2/people?where[search_name_or_email]=${encodeURIComponent(q)}&include=emails,phone_numbers&per_page=25`,
  people: "/people/v2/people",
  person: (id) => `/people/v2/people/${id}`,
  emails: (id) => `/people/v2/people/${id}/emails`,
  phones: (id) => `/people/v2/people/${id}/phone_numbers`,
  tabs: "/people/v2/tabs?per_page=100",
  createTab: "/people/v2/tabs",
  // CONFIRM: field definitions are created under a tab; data_type "string" holds short text.
  fieldDefinitions: (tabId) => `/people/v2/tabs/${tabId}/field_definitions?per_page=100`,
  createFieldDefinition: (tabId) => `/people/v2/tabs/${tabId}/field_definitions`,
  fieldData: (personId) => `/people/v2/people/${personId}/field_data?per_page=100`,
  createFieldDatum: (personId) => `/people/v2/people/${personId}/field_data`,
  fieldDatum: (id) => `/people/v2/field_data/${id}`,
  noteCategories: "/people/v2/note_categories?per_page=100",
  createNoteCategory: "/people/v2/note_categories",
  // CONFIRM: notes are created on the person and need a note_category_id attribute.
  createNote: (personId) => `/people/v2/people/${personId}/notes`,
  servicesTeams: `/services/v2/teams?per_page=100`,
  // CONFIRM: people on a Services team. Docs list /services/v2/teams/{id}/people; if your account only exposes
  // positions, use /services/v2/teams/{id}/person_team_position_assignments?include=person instead.
  teamPeople: (teamId) => `/services/v2/teams/${teamId}/people?per_page=100`,
};

// The tab, fields and note category this app adds to each church's Planning Center People
export const TAB_NAME = "Here To Serve";
export const FIELDS = { gifts: "Top gifts", team: "Team", membership: "Membership", firstSunday: "First Sunday" };
export const NOTE_CATEGORY = "Here To Serve";
