import { eveChannel } from "eve/channels/eve";
import { httpBasic } from "eve/channels/auth";
const password = process.env.EVE_SPIKE_PASSWORD;
if (!password || password.length < 32)
  throw new Error("Set a local EVE_SPIKE_PASSWORD of at least 32 characters.");
export default eveChannel({
  auth: [httpBasic({ username: "local-spike", password })],
});
