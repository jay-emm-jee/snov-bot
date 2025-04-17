import dotenv from 'dotenv';
dotenv.config();
import { Client, Collection, Events, GatewayIntentBits, Partials, EmbedBuilder } from "discord.js";

import { verifySignature, getSigningMessage, getCollateralAddress, isInSnList } from "./src/verify.js";
import { disableChannelAccess, enableChannelAccess, sendDM, sendVerifiedDM, sendChannelArrivalMessage } from "./src/bot.js";
import { addUserToDB } from "./src/db.js";
import { FAIL, SUCCESS, ERROR } from "./src/constants.js";
import { dailyTask } from "./src/collateral-checker.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Message,
    Partials.Channel
  ]
});

dailyTask(client);

client.once(Events.ClientReady, readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  
  // Respond only to DMs
  if (message.channel.isDMBased()) {
    const userID = message.author.id;

    // get the first word that starts with an exclamation mark
    const command = message.content.split(/\s+/);
    if (command !== null && command.length > 0) {
      switch (command[0].toLowerCase()) {
        case "!help":
            sendDM(client, userID, SUCCESS, `SNOV-bot is a bot designed to verify whether a user is the owner of a specific Sentry Node collateral address
                                  and enables access to the Syscoin OGs channel if so. The process is as follows:
                                  1. The user signs a message with their Syscoin QT wallet using the details provided by the !getMessage command:\n
                                  > !getMessage *collateralTxid*\n
                                  *collateralTxid is the txid of the transaction used to send the collateral*\n
                                  2. The user then uses the signed message in the next command, !verify, in order to verify their signature to prove that they own the address associated with the collateral:\n
                                  > !verify $collateralTxid *signedMessage*\n
                                  *signedMessage is the output generated by the signmessage command in the Syscoin QT wallet*`);
          break;
        case "!getmessage":
          if (command.length > 1) {
            const { status, message } = await getSigningMessage(command[1], userID);
            sendDM(client, userID, status, message);
          } else {
            sendDM(client, userID, FAIL, "Missing a collateral transaction ID.");
          }
          break;
        case "!verify":
          if (command.length > 2) {
            const collateral = await getCollateralAddress(command[1]);
            const inSnList = await isInSnList(collateral.address);
            
            if (collateral.status === SUCCESS && inSnList) {
              const verified = await verifySignature(userID, collateral.address, command[2]);
              if (verified) {
                const added = await addUserToDB(userID, command[1], collateral.address, command[2]);
                if (added) {
                  const enabled = await enableChannelAccess(client, userID);

                  if (enabled) {
                    sendVerifiedDM(client, userID, `Congratulations, you are now verified and can access the OGs channel!\n
                                          Thank you for supporting Syscoin!`);
                    sendChannelArrivalMessage(client, userID);
                  } else {
                    sendDM(client, userID, FAIL, "Could not enable access to the channel.");
                  }
                } else {
                    sendDM(client, userID, FAIL, "Could not add user to the database.");
                }
              } else {
                sendDM(client, userID, FAIL, "Verification failed. Are you sure you entered the information correctly?");
              }
            } else {
              sendDM(client, userID, FAIL, "Unspent collateral has not been found or Sentry Node is not active.");
            }
          } else {
            sendDM(client, userID, FAIL, "Missing a collateral transaction ID or signed message.");
          }
          break;
        default:
            sendDM(client, userID, FAIL, "Unrecognised command.");
          break;
      }
    }
  }
});

client.login(process.env.CLIENT_TOKEN);