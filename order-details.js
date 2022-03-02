const axios = require("axios");
const fs = require("fs");
const readline = require("readline");

const axiosApiInstance = axios.create();
let reader = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log(
  "\nOnly write below details if running first time or incase of new details, otherwise just press Enter\n"
);

const STORE_VARS = JSON.parse(fs.readFileSync("secrets.json"));

const getAccessToken = () => {
  return new Promise((resolve, reject) => {
    reader.question("Access Token ", (answer) => {
      resolve(answer);
    });
  });
};

const getStore = () => {
  return new Promise((resolve, reject) => {
    reader.question("Store ", (answer) => {
      resolve(answer);
    });
  });
};

const getStartDate = () => {
  return new Promise((resolve, reject) => {
    reader.question("Start Date (ISO 8601) ", (answer) => {
      resolve(answer);
    });
  });
};

const getEndDate = () => {
  return new Promise((resolve, reject) => {
    reader.question("End Date (ISO 8601) ", (answer) => {
      resolve(answer);
    });
  });
};

const main = async () => {
  const ACCESS_TOKEN = (await getAccessToken()) || STORE_VARS["ACCESS_TOKEN"];
  const STORE = (await getStore()) || STORE_VARS["STORE"];
  const startDate = (await getStartDate()) || STORE_VARS["startDate"];
  const endDate = (await getEndDate()) || STORE_VARS["endDate"];

  axiosApiInstance.interceptors.request.use(
    async (config) => {
      config.headers = {
        "X-Shopify-Access-Token": ACCESS_TOKEN,
        "Content-Type": "application/json",
      };
      return config;
    },
    (error) => {
      Promise.reject(error);
    }
  );

  axiosApiInstance.interceptors.response.use(
    async (response) => {
      return Promise.resolve(response);
    },
    async (error) => {
      return Promise.reject(error);
    }
  );

  const queryData = {
    totalOrders: 0,
    distinctIds: {
      direct: 0,
      indirect: 0,
      others: 0,
    },
  };

  const direct = [];
  const indirect = [];
  const others = [];

  async function call(store, path, last) {
    let reqUrl = `https://${store}/admin/api/2021-10/${path}.json?limit=250&since_id=${last}`;
    reqUrl =
      !startDate
        ? reqUrl
        : `${reqUrl}&created_at_min=${startDate}`;
    reqUrl =
      !endDate
        ? reqUrl
        : `${reqUrl}&created_at_max=${endDate}`;

    console.log(reqUrl);

    const result = await axiosApiInstance.get(reqUrl);
    const orders = result.data.orders;
    if (orders.length == 0 && last == 0){
      console.log("orders ", orders);
      return;
    }

    queryData["totalOrders"] = queryData["totalOrders"] + orders.length;

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const line_items = order["line_items"];
      for (let j = 0; j < line_items.length; j++) {
        const properties = line_items[j]["properties"];
        if (properties.length > 0) {
          const orderType = properties[0]["value"]["order_type"];
          const distinctId = properties[0]["value"]["distinct_id"]
          orderType == "direct" && direct.push(distinctId);
          orderType == "indirect" && indirect.push(distinctId);
          orderType == "others" && others.push(distinctId);
        }
      }
    }
    if (orders.length < 250) {
      queryData.distinctIds.direct = direct.length;
      queryData.distinctIds.indirect = indirect.length;
      queryData.distinctIds.others = others.length;
      console.log(queryData);
    //   console.log("distinct ids direct", direct);
    //   console.log("distinct ids indirect", indirect);
    //   console.log("distinct ids others", others);
      fs.writeFileSync(
        "secrets.json",
        JSON.stringify({ ACCESS_TOKEN, STORE, startDate, endDate })
      );
      return;
    } else {
      last = orders[orders.length - 1]["id"];
      call(store, path, last);
    }
  }

  await call(STORE, "orders", 0);
  reader.close();
};

main();
