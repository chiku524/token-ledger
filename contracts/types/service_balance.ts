/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/service_balance.json`.
 */
export type ServiceBalance = {
  "address": "DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb",
  "metadata": {
    "name": "serviceBalance",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Token Ledger Service Balance: bounded, customer-authorized USDC subscriptions"
  },
  "instructions": [
    {
      "name": "activateMandateAndCharge",
      "discriminator": [
        27,
        158,
        211,
        164,
        80,
        23,
        133,
        215
      ],
      "accounts": [
        {
          "name": "controller",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "plan"
        },
        {
          "name": "mandate",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  110,
                  100,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "receipt",
          "docs": [
            "The receipt for the atomic first charge (cycle 0), seeded by mandate and",
            "cycle so it cannot be created or collected twice."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  97,
                  114,
                  103,
                  101,
                  95,
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mandate"
              },
              {
                "kind": "const",
                "value": [
                  0,
                  0,
                  0,
                  0,
                  0,
                  0,
                  0,
                  0
                ]
              }
            ]
          }
        },
        {
          "name": "merchant"
        },
        {
          "name": "vaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  108,
                  108,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.merchant",
                "account": "billingVault"
              },
              {
                "kind": "account",
                "path": "vault.controller",
                "account": "billingVault"
              }
            ]
          }
        },
        {
          "name": "vaultToken",
          "writable": true
        },
        {
          "name": "destinationToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "maxTotalDebit",
          "type": "u64"
        },
        {
          "name": "authorizationExpiry",
          "type": "i64"
        }
      ]
    },
    {
      "name": "collectCycle",
      "discriminator": [
        133,
        120,
        131,
        109,
        113,
        161,
        86,
        172
      ],
      "accounts": [
        {
          "name": "collector",
          "docs": [
            "The collector triggers the charge; any caller could, but only to the",
            "fixed destination, so this is an operational role, not an authority.",
            "It pays rent for the receipt PDA."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "merchant"
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "mandate",
          "writable": true
        },
        {
          "name": "receipt",
          "docs": [
            "The receipt for this cycle, seeded by mandate and cycle. `init_if_needed`",
            "lets the instruction require `cycle == mandate.next_cycle` first, so a",
            "replay of a collected cycle fails with `WrongCycle` before any transfer."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  97,
                  114,
                  103,
                  101,
                  95,
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mandate"
              },
              {
                "kind": "arg",
                "path": "cycle"
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  108,
                  108,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.merchant",
                "account": "billingVault"
              },
              {
                "kind": "account",
                "path": "vault.controller",
                "account": "billingVault"
              }
            ]
          }
        },
        {
          "name": "vaultToken",
          "writable": true
        },
        {
          "name": "destinationToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "cycle",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createBillingVault",
      "discriminator": [
        5,
        124,
        128,
        23,
        2,
        251,
        207,
        30
      ],
      "accounts": [
        {
          "name": "controller",
          "writable": true,
          "signer": true
        },
        {
          "name": "merchant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  114,
                  99,
                  104,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "merchant.admin",
                "account": "merchantConfig"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  108,
                  108,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "merchant"
              },
              {
                "kind": "account",
                "path": "controller"
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  108,
                  108,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "merchant"
              },
              {
                "kind": "account",
                "path": "controller"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vaultToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  108,
                  108,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "controller",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "createPlanVersion",
      "discriminator": [
        35,
        119,
        73,
        125,
        33,
        216,
        110,
        111
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "merchant"
          ]
        },
        {
          "name": "merchant"
        },
        {
          "name": "plan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  110,
                  95,
                  118,
                  101,
                  114,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "merchant"
              },
              {
                "kind": "arg",
                "path": "planId"
              },
              {
                "kind": "arg",
                "path": "version"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "planId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "version",
          "type": "u16"
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "maxPeriods",
          "type": "u32"
        }
      ]
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "controller",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "depositorToken",
          "writable": true
        },
        {
          "name": "vaultToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeMerchant",
      "discriminator": [
        7,
        90,
        74,
        38,
        99,
        111,
        142,
        77
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "collector"
        },
        {
          "name": "merchant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  114,
                  99,
                  104,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "pubkey"
        },
        {
          "name": "tokenProgram",
          "type": "pubkey"
        },
        {
          "name": "destination",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "replaceMandate",
      "discriminator": [
        68,
        86,
        19,
        108,
        67,
        139,
        30,
        30
      ],
      "accounts": [
        {
          "name": "controller",
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "plan"
        },
        {
          "name": "mandate",
          "docs": [
            "The current mandate, replaced in place. A replacement never creates a",
            "second mandate, so overlapping coverage cannot be charged twice."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  110,
                  100,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "maxTotalDebit",
          "type": "u64"
        },
        {
          "name": "authorizationExpiry",
          "type": "i64"
        }
      ]
    },
    {
      "name": "revokeMandate",
      "discriminator": [
        252,
        97,
        140,
        119,
        67,
        43,
        177,
        108
      ],
      "accounts": [
        {
          "name": "controller",
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "mandate",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "rotateCollector",
      "discriminator": [
        242,
        186,
        190,
        160,
        86,
        171,
        219,
        191
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "merchant"
          ]
        },
        {
          "name": "merchant",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "collector",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setCollectionPause",
      "discriminator": [
        68,
        115,
        6,
        8,
        223,
        24,
        76,
        37
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "merchant"
          ]
        },
        {
          "name": "merchant",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "controller",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "vaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  108,
                  108,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.merchant",
                "account": "billingVault"
              },
              {
                "kind": "account",
                "path": "vault.controller",
                "account": "billingVault"
              }
            ]
          }
        },
        {
          "name": "vaultToken",
          "writable": true
        },
        {
          "name": "destinationToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "billingVault",
      "discriminator": [
        44,
        139,
        47,
        153,
        40,
        100,
        244,
        122
      ]
    },
    {
      "name": "chargeReceipt",
      "discriminator": [
        12,
        170,
        183,
        40,
        252,
        214,
        217,
        237
      ]
    },
    {
      "name": "mandate",
      "discriminator": [
        113,
        216,
        98,
        159,
        185,
        63,
        55,
        18
      ]
    },
    {
      "name": "merchantConfig",
      "discriminator": [
        184,
        154,
        125,
        252,
        112,
        73,
        0,
        144
      ]
    },
    {
      "name": "planVersion",
      "discriminator": [
        28,
        234,
        239,
        110,
        19,
        210,
        3,
        13
      ]
    }
  ],
  "events": [
    {
      "name": "billingVaultCreated",
      "discriminator": [
        239,
        47,
        122,
        40,
        61,
        181,
        159,
        173
      ]
    },
    {
      "name": "collectionPauseChanged",
      "discriminator": [
        205,
        91,
        12,
        203,
        248,
        45,
        244,
        126
      ]
    },
    {
      "name": "collectorRotated",
      "discriminator": [
        99,
        3,
        62,
        187,
        111,
        208,
        211,
        89
      ]
    },
    {
      "name": "cycleCollected",
      "discriminator": [
        236,
        45,
        184,
        233,
        5,
        176,
        237,
        92
      ]
    },
    {
      "name": "deposited",
      "discriminator": [
        111,
        141,
        26,
        45,
        161,
        35,
        100,
        57
      ]
    },
    {
      "name": "mandateActivated",
      "discriminator": [
        169,
        1,
        206,
        214,
        221,
        108,
        57,
        156
      ]
    },
    {
      "name": "mandateReplaced",
      "discriminator": [
        217,
        129,
        69,
        180,
        13,
        78,
        77,
        232
      ]
    },
    {
      "name": "mandateRevoked",
      "discriminator": [
        228,
        111,
        181,
        60,
        204,
        58,
        131,
        28
      ]
    },
    {
      "name": "withdrawn",
      "discriminator": [
        20,
        89,
        223,
        198,
        194,
        124,
        219,
        13
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notAdmin",
      "msg": "The caller is not the merchant admin."
    },
    {
      "code": 6001,
      "name": "notCollector",
      "msg": "The caller is not the authorized collector."
    },
    {
      "code": 6002,
      "name": "notController",
      "msg": "The caller is not the billing vault controller."
    },
    {
      "code": 6003,
      "name": "collectionPaused",
      "msg": "Collection is paused."
    },
    {
      "code": 6004,
      "name": "mandateRevoked",
      "msg": "The mandate is revoked."
    },
    {
      "code": 6005,
      "name": "mandateExpired",
      "msg": "The mandate has expired."
    },
    {
      "code": 6006,
      "name": "wrongCycle",
      "msg": "The cycle number does not match the mandate's expected next cycle."
    },
    {
      "code": 6007,
      "name": "wrongAmount",
      "msg": "The amount does not equal the signed plan price."
    },
    {
      "code": 6008,
      "name": "capExceeded",
      "msg": "The authorization cap would be exceeded."
    },
    {
      "code": 6009,
      "name": "notYetDue",
      "msg": "The mandate is not yet due for another collection."
    },
    {
      "code": 6010,
      "name": "coveragePastExpiry",
      "msg": "New coverage would end after the mandate authorization expiry."
    },
    {
      "code": 6011,
      "name": "insufficientFunds",
      "msg": "Insufficient token balance."
    },
    {
      "code": 6012,
      "name": "wrongMint",
      "msg": "The mint or token program does not match the merchant config."
    },
    {
      "code": 6013,
      "name": "mathOverflow",
      "msg": "An arithmetic overflow occurred."
    },
    {
      "code": 6014,
      "name": "wrongMerchant",
      "msg": "The vault is not associated with this merchant."
    },
    {
      "code": 6015,
      "name": "wrongTokenAccount",
      "msg": "The token account is not owned by the vault authority."
    }
  ],
  "types": [
    {
      "name": "billingVault",
      "docs": [
        "A customer's billing vault. The vault authority is a PDA of this program;",
        "the vault's token account is owned by that PDA. Only the controller may",
        "deposit, sign a mandate, revoke or withdraw."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "authorityBump",
            "type": "u8"
          },
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "controller",
            "docs": [
              "The single controller wallet for this vault (version one)."
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "tokenAccount",
            "docs": [
              "The vault's USDC token account."
            ],
            "type": "pubkey"
          },
          {
            "name": "generation",
            "docs": [
              "Monotonic generation, incremented on mandate replacement."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "billingVaultCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "controller",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "chargeReceipt",
      "docs": [
        "A durable, addressable record of one collected cycle. Seeded by the mandate",
        "and the cycle number, so a cycle can never be recorded twice even if the",
        "emitted event is missed. Version one collects one cycle per instruction."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mandate",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "cycle",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "coverageStart",
            "type": "i64"
          },
          {
            "name": "coverageEnd",
            "type": "i64"
          },
          {
            "name": "collectedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "collectionPauseChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "collectorRotated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "collector",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "cycleCollected",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mandate",
            "type": "pubkey"
          },
          {
            "name": "cycle",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "coverageStart",
            "type": "i64"
          },
          {
            "name": "coverageEnd",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "deposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "mandate",
      "docs": [
        "A signed, bounded authorization. Its terms are fixed at signing; a replacement",
        "is a new mandate with a higher generation."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "plan",
            "type": "pubkey"
          },
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "price",
            "docs": [
              "Fixed price copied from the plan version at signing."
            ],
            "type": "u64"
          },
          {
            "name": "periodSeconds",
            "type": "i64"
          },
          {
            "name": "maxTotalDebit",
            "docs": [
              "Lifetime cap on cumulative debits, in base units."
            ],
            "type": "u64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "authorizationExpiry",
            "docs": [
              "After this instant, no new coverage may extend."
            ],
            "type": "i64"
          },
          {
            "name": "totalDebited",
            "docs": [
              "Cumulative amount debited so far."
            ],
            "type": "u64"
          },
          {
            "name": "nextCycle",
            "docs": [
              "The next cycle number expected on a collection."
            ],
            "type": "u64"
          },
          {
            "name": "paidThrough",
            "docs": [
              "Coverage end time already paid for."
            ],
            "type": "i64"
          },
          {
            "name": "revoked",
            "type": "bool"
          },
          {
            "name": "generation",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "mandateActivated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "mandate",
            "type": "pubkey"
          },
          {
            "name": "cycle",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "paidThrough",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "mandateReplaced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "mandate",
            "type": "pubkey"
          },
          {
            "name": "generation",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "mandateRevoked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mandate",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "merchantConfig",
      "docs": [
        "Merchant administration. Holds no customer funds; it names the fixed mint,",
        "the collector that may trigger collection, and a pause switch. It can never",
        "withdraw customer funds or change the destination of an existing mandate."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "admin",
            "docs": [
              "Governance authority that administers the merchant config."
            ],
            "type": "pubkey"
          },
          {
            "name": "collector",
            "docs": [
              "Operational key allowed to trigger a collection. Rotatable."
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "The one USDC mint this deployment accepts."
            ],
            "type": "pubkey"
          },
          {
            "name": "tokenProgram",
            "docs": [
              "The SPL Token program (legacy) this deployment uses."
            ],
            "type": "pubkey"
          },
          {
            "name": "destination",
            "docs": [
              "Fixed merchant destination for collected funds."
            ],
            "type": "pubkey"
          },
          {
            "name": "collectionPaused",
            "docs": [
              "When true, new collections are refused. Withdrawals are never blocked."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "planVersion",
      "docs": [
        "An immutable plan version. A new price or term is a new version; an existing",
        "mandate keeps pointing at the version it signed."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "planId",
            "docs": [
              "Opaque plan id the merchant controls."
            ],
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "version",
            "type": "u16"
          },
          {
            "name": "price",
            "docs": [
              "Fixed price per 30-day period, in USDC base units."
            ],
            "type": "u64"
          },
          {
            "name": "periodSeconds",
            "docs": [
              "Period length in seconds (30 days)."
            ],
            "type": "i64"
          },
          {
            "name": "maxPeriods",
            "docs": [
              "How many periods a mandate may be charged in total."
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "withdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
