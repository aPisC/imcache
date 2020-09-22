export default class Imcache {
  constructor(
    loader,
    checkTime = 3000,
    removeTime = 10000,
    keepUsedItems = true
  ) {
    this.loader = loader;
    this.checkTime = checkTime;
    this.removeTime = removeTime;
    this.keepUsedItems = keepUsedItems;
    this.getId = (id) => id;

    let timeout = null;
    let itemCount = 0;

    let valueStore = {};
    let timestampStore = {};
    let lastuseStore = {};
    let timerangeStore = {};

    function clearCache() {
      timeout = null;

      const t = +new Date();
      const r = Math.floor(t / this.removeTime);

      Object.keys(timerangeStore).forEach((range) => {
        if (range >= r) return;

        let isRemoveable = true;
        timerangeStore[range].forEach((item) => {
          if (t - item.t <= this.removeTime) {
            // keep the range data if there is items stored in it
            isRemoveable = false;
          } else if (timestampStore[item.id] === item.t) {
            // remove or update item if not changed since loading
            if (
              this.keepUsedItems &&
              lastuseStore[item.id] !== timestampStore[item.id]
            ) {
              // item was used since loading, keep it in memory
              timestampStore[item.id] = t;
              lastuseStore[item.id] = t;
              if (!timerangeStore[r]) timerangeStore[r] = [];
              timerangeStore[r].push({ id: item.id, t: t });
            } else if (
              !valueStore[item.id] ||
              typeof valueStore[item.id] !== "object" ||
              !valueStore[item.id].__imcache_keep
            ) {
              // delete old item
              delete timestampStore[item.id];
              delete valueStore[item.id];
              delete lastuseStore[item.id];
              itemCount--;
            } else {
              isRemoveable = false;
            }
          }
        });

        // remove unused Range
        if (isRemoveable) {
          delete timerangeStore[range];
        }
      });

      if (itemCount > 0 && timeout == null) {
        timeout = setTimeout(clearCache.bind(this), this.checkTime);
      }
    }

    async function get(id) {
      // resolve id of parameter
      const _id = this.getId(id);

      // return item if available
      if (valueStore[_id] !== undefined) {
        lastuseStore[_id] = +new Date();
        return valueStore[_id];
      }

      // load data
      const data = await this.loader(id);

      // Return item if it was loaded while the promie was pending
      if (valueStore[_id] !== undefined) {
        lastuseStore[_id] = +new Date();
        return valueStore[_id];
      }

      const t = +new Date();
      const r = Math.floor(t / this.removeTime);

      // store data and timestamps
      if (valueStore[_id] === undefined) itemCount++;
      valueStore[_id] = data;
      timestampStore[_id] = t;
      lastuseStore[_id] = t;

      if (!timerangeStore[r]) timerangeStore[r] = [];
      timerangeStore[r].push({ id: _id, t: t });

      // start clearing timer
      if (timeout == null) {
        timeout = setTimeout(clearCache.bind(this), this.checkTime);
      }
      return data;
    }

    async function getAll(ids) {
      return await Promise.all(ids.map((id) => this.get(id)));
    }

    function remove(id) {
      const _id = this.getId(id);
      delete valueStore[_id];
      delete lastuseStore[_id];
      delete timestampStore[_id];
    }

    function clear() {
      valueStore = {};
      timestampStore = {};
      lastuseStore = {};
      timerangeStore = {};

      if (timeout != null) {
        clearTimeout(timeout);
        timeout = null;
      }
    }

    this.get = get;
    this.remove = remove;
    this.clear = clear;
    this.getAll = getAll;
  }
}
