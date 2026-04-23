# Summary

a set packages for retrieving and caching github data that is used to calculate various stats on a per-repo, per-user, or per-org basis. Data and stats can be deployed as a standalone app running on bun or as a backstage.io plugin using the new backend and frontend architecture.

# packages

- github api data interfaces and retrieval
- statistics calculations
- persistence layer for raw data and calculated stats
- backstage.io frontend
- backstage.io backend
- bun http server, including the alpine.js frontend.

# Details

- persistence layer should work with backstage or just a sqlite interface
- configs should be written in yaml
- use alpinejs for the standalone server

# Raw Data

- repository info, including all dates and pre-calculated stats by github
- pull requests for each repository, including all dates and any pre-calculated stats by github
