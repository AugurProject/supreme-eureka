import { task } from "hardhat/config";
import axios from "axios";

task("fetch-teams-event", "Retrieve teams information")
  .addParam("key", "The API key for fetching from TheRunDown")
  .setAction(async (args, hre) => {
    const result = await axios({
      method: "GET",
      url: `https://therundown-therundown-v1.p.rapidapi.com/sports`,
      // params: { include: "scores" },
      headers: {
        "x-rapidapi-key": args.key,
        "x-rapidapi-host": "therundown-therundown-v1.p.rapidapi.com",
      },
    });

    console.log(JSON.stringify(result.data, null, "  "));
  });
