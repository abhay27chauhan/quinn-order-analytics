const axios = require("axios");
const fs = require("fs");
const readline = require("readline");

const axiosApiInstance = axios.create();
let reader = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

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
    reader.question("Start Date (DD-MM-YYYY) ", (answer) => {
      resolve(answer);
    });
  });
};

const getEndDate = () => {
  return new Promise((resolve, reject) => {
    reader.question("End Date (DD-MM-YYYY) ", (answer) => {
      resolve(answer);
    });
  });
};

const main = async () => {
  const ACCESS_TOKEN = (await getAccessToken()) || STORE_VARS["ACCESS_TOKEN"];
  const STORE = (await getStore()) || STORE_VARS["STORE"];
  const startDate = (await getStartDate()) || STORE_VARS["startDate"];
  const endDate = (await getEndDate()) || STORE_VARS["endDate"];

  const startDateArray = startDate.split("-");
  const endDateArray = endDate.split("-");

  let created_at_min;
  let created_at_max;
  if (startDateArray.length == 3) {
    created_at_min = new Date(
      startDateArray[2],
      startDateArray[1],
      startDateArray[0]
    ).toISOString();
  }
  if (endDateArray.length == 3) {
    created_at_max = new Date(
      endDateArray[2],
      endDateArray[1],
      endDateArray[0]
    ).toISOString();
  }

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

  const direct = new Set();
  const indirect = new Set();
  const others = new Set();

  async function call(store, path, last) {
    let reqUrl = `https://${store}/admin/api/2021-10/${path}.json?limit=250`;
    reqUrl = last == 0 ? reqUrl : `${reqUrl}&since_id=${last}`;
    reqUrl =
      created_at_min == undefined
        ? reqUrl
        : `${reqUrl}&created_at_min=${created_at_min}`;
    reqUrl =
      created_at_max == undefined
        ? reqUrl
        : `${reqUrl}&created_at_max=${created_at_max}`;

    console.log(reqUrl);

    const result = await axiosApiInstance.get(reqUrl);
    const orders = result.data.orders;

    queryData["totalOrders"] = queryData["totalOrders"] + orders.length;

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const line_items = order["line_items"];
      const customerId = order.customer && order.customer.id;
      if (customerId) {
        for (let j = 0; j < line_items.length; j++) {
          const properties = line_items[j]["properties"];
          if (properties.length > 0) {
            const orderType = properties[0]["value"]["order_type"];
            orderType == "direct" && direct.add(customerId);
            orderType == "indirect" && indirect.add(customerId);
            orderType == "others" && others.add(customerId);
          }
        }
      }
    }
    if (orders.length < 250) {
      queryData.distinctIds.direct = direct.size;
      queryData.distinctIds.indirect = indirect.size;
      queryData.distinctIds.others = others.size;
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
