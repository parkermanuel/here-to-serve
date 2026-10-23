// One interface for every people system a church can connect. The sync function and dashboard
// only talk to this; adding another system means adding one entry here.
import * as pco from "./pco.js";
import * as breeze from "./breeze.js";

export const CONNECTORS = {
  pco: {
    label: "Planning Center",
    pushPerRun: 60,
    // conn: the connections row. opts: { fetch, clientId, clientSecret, onTokens }
    client: (conn, opts) => pco.makeClient(conn, opts),
    setup: pco.ensureSetup,
    push: pco.pushMember,      // (client, ids, member, commitments, state) -> { personId, state }
    pull: pco.pullTeams,       // (client, { mapped, ids }) -> { teams: [{id, name}], roster: [{teamId, personId, name}] }
    test: pco.test,            // (client) -> { orgName }
  },
  breeze: {
    label: "Breeze",
    pushPerRun: 10,            // Breeze allows far fewer requests a minute
    client: (conn, opts) => breeze.makeClient(conn, opts),
    setup: breeze.ensureSetup,
    push: breeze.pushMember,
    pull: breeze.pullTeams,
    test: breeze.test,
  },
};
