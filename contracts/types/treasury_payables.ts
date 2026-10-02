/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/treasury_payables.json`.
 */
export type TreasuryPayables = {
  "address": "33YoPF5P1v9qkgMpzPTHtWnCcA9u9eE9iv6xutWRyZCs",
  "metadata": {
    "name": "treasuryPayables",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Token Ledger Accounts Payable treasury: quorum-approved supplier payments"
  },
  "instructions": [
    {
      "name": "approveGovernance",
      "discriminator": [
        90,
        116,
        1,
        180,
        176,
        79,
        244,
        224
      ],
      "accounts": [
        {
          "name": "approver",
          "signer": true
        },
        {
          "name": "treasury",
          "relations": [
            "governance"
          ]
        },
        {
          "name": "governance",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "approvePayment",
      "discriminator": [
        21,
        123,
        195,
        139,
        107,
        141,
        34,
        187
      ],
      "accounts": [
        {
          "name": "approver",
          "signer": true
        },
        {
          "name": "treasury",
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "proposal",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "cancelPayment",
      "discriminator": [
        217,
        129,
        71,
        37,
        216,
        193,
        38,
        33
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "treasury",
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "proposal",
          "writable": true
        }
      ],
      "args": []
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
          "name": "funder",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "funderToken",
          "writable": true
        },
        {
          "name": "treasuryToken",
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
      "name": "executeEmergencyExit",
      "discriminator": [
        100,
        185,
        247,
        167,
        47,
        188,
        16,
        11
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "governance"
          ]
        },
        {
          "name": "governance",
          "writable": true
        },
        {
          "name": "treasuryAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              }
            ]
          }
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "recoveryToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "executePayment",
      "discriminator": [
        86,
        4,
        7,
        7,
        120,
        139,
        232,
        139
      ],
      "accounts": [
        {
          "name": "executor",
          "docs": [
            "Any caller may execute an already eligible payment; the fixed checks",
            "prevent diversion. Kept as a signer so the operation is attributable."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "proposal",
          "writable": true
        },
        {
          "name": "settlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  118,
                  111,
                  105,
                  99,
                  101,
                  95,
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "account",
                "path": "proposal.invoice_key",
                "account": "paymentProposal"
              }
            ]
          }
        },
        {
          "name": "treasuryAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              }
            ]
          }
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "recipientToken",
          "writable": true
        },
        {
          "name": "dailySpend",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  105,
                  108,
                  121,
                  95,
                  115,
                  112,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
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
        }
      ],
      "args": []
    },
    {
      "name": "executePolicyChange",
      "discriminator": [
        127,
        42,
        199,
        98,
        79,
        199,
        181,
        102
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "governance"
          ]
        },
        {
          "name": "governance",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "initializeTreasury",
      "discriminator": [
        124,
        186,
        211,
        195,
        85,
        165,
        129,
        166
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "entity"
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "arg",
                "path": "entity"
              }
            ]
          }
        },
        {
          "name": "treasuryAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "treasuryToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
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
                "path": "treasury"
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
          "name": "entity",
          "type": "pubkey"
        },
        {
          "name": "mint",
          "type": "pubkey"
        },
        {
          "name": "tokenProgram",
          "type": "pubkey"
        },
        {
          "name": "threshold",
          "type": "u8"
        },
        {
          "name": "approvers",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "proposers",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "perPaymentLimit",
          "type": "u64"
        },
        {
          "name": "dailyLimit",
          "type": "u64"
        },
        {
          "name": "maxProposalLifetime",
          "type": "i64"
        },
        {
          "name": "recovery",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "pauseExecution",
      "discriminator": [
        254,
        15,
        49,
        32,
        131,
        119,
        85,
        196
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "proposeGovernance",
      "discriminator": [
        129,
        138,
        213,
        117,
        56,
        242,
        208,
        54
      ],
      "accounts": [
        {
          "name": "actor",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury"
        },
        {
          "name": "governance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  118,
                  101,
                  114,
                  110,
                  97,
                  110,
                  99,
                  101,
                  95,
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "account",
                "path": "treasury.policy_version",
                "account": "treasuryConfig"
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
          "name": "kind",
          "type": {
            "defined": {
              "name": "governanceKind"
            }
          }
        },
        {
          "name": "newThreshold",
          "type": "u8"
        },
        {
          "name": "newApproverCount",
          "type": "u8"
        },
        {
          "name": "newApprovers",
          "type": {
            "array": [
              "pubkey",
              10
            ]
          }
        },
        {
          "name": "newPerPaymentLimit",
          "type": "u64"
        },
        {
          "name": "newDailyLimit",
          "type": "u64"
        },
        {
          "name": "newRecovery",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "proposePayment",
      "discriminator": [
        102,
        219,
        97,
        51,
        201,
        219,
        247,
        27
      ],
      "accounts": [
        {
          "name": "proposer",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "settlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  118,
                  111,
                  105,
                  99,
                  101,
                  95,
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "arg",
                "path": "invoiceKey"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  121,
                  109,
                  101,
                  110,
                  116,
                  95,
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "arg",
                "path": "invoiceKey"
              },
              {
                "kind": "arg",
                "path": "revision"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "invoiceKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "revision",
          "type": "u32"
        },
        {
          "name": "recipientOwner",
          "type": "pubkey"
        },
        {
          "name": "grossAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "revokeApproval",
      "discriminator": [
        44,
        51,
        184,
        108,
        182,
        202,
        20,
        53
      ],
      "accounts": [
        {
          "name": "approver",
          "signer": true
        },
        {
          "name": "treasury",
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "proposal",
          "writable": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "dailySpend",
      "discriminator": [
        101,
        40,
        199,
        240,
        86,
        235,
        159,
        153
      ]
    },
    {
      "name": "governanceProposal",
      "discriminator": [
        53,
        107,
        240,
        190,
        43,
        73,
        65,
        143
      ]
    },
    {
      "name": "invoiceSettlement",
      "discriminator": [
        10,
        6,
        253,
        49,
        227,
        161,
        223,
        69
      ]
    },
    {
      "name": "paymentProposal",
      "discriminator": [
        12,
        244,
        209,
        90,
        226,
        76,
        223,
        128
      ]
    },
    {
      "name": "treasuryConfig",
      "discriminator": [
        124,
        54,
        212,
        227,
        213,
        189,
        168,
        41
      ]
    }
  ],
  "events": [
    {
      "name": "approvalRevoked",
      "discriminator": [
        0,
        143,
        189,
        167,
        179,
        12,
        235,
        123
      ]
    },
    {
      "name": "emergencyExitExecuted",
      "discriminator": [
        236,
        206,
        26,
        200,
        72,
        89,
        239,
        121
      ]
    },
    {
      "name": "paymentApproved",
      "discriminator": [
        198,
        137,
        113,
        99,
        77,
        210,
        108,
        36
      ]
    },
    {
      "name": "paymentCancelled",
      "discriminator": [
        137,
        140,
        226,
        59,
        55,
        152,
        253,
        179
      ]
    },
    {
      "name": "paymentExecuted",
      "discriminator": [
        153,
        165,
        141,
        18,
        246,
        20,
        204,
        227
      ]
    },
    {
      "name": "paymentProposed",
      "discriminator": [
        13,
        197,
        21,
        96,
        186,
        23,
        185,
        125
      ]
    },
    {
      "name": "policyChanged",
      "discriminator": [
        248,
        184,
        113,
        45,
        123,
        255,
        43,
        248
      ]
    },
    {
      "name": "treasuryCreated",
      "discriminator": [
        190,
        59,
        58,
        105,
        76,
        234,
        21,
        199
      ]
    },
    {
      "name": "treasuryFunded",
      "discriminator": [
        172,
        66,
        241,
        101,
        216,
        219,
        147,
        130
      ]
    },
    {
      "name": "treasuryPaused",
      "discriminator": [
        28,
        43,
        74,
        164,
        9,
        18,
        109,
        91
      ]
    },
    {
      "name": "treasuryUnpaused",
      "discriminator": [
        70,
        108,
        185,
        239,
        91,
        161,
        110,
        154
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notAuthorized",
      "msg": "The caller is not authorized for this action."
    },
    {
      "code": 6001,
      "name": "badThreshold",
      "msg": "The approval threshold is invalid."
    },
    {
      "code": 6002,
      "name": "tooManySigners",
      "msg": "Too many approvers or proposers."
    },
    {
      "code": 6003,
      "name": "duplicateApproval",
      "msg": "This signer has already approved."
    },
    {
      "code": 6004,
      "name": "stalePolicy",
      "msg": "The policy version does not match the current treasury policy."
    },
    {
      "code": 6005,
      "name": "staleRevision",
      "msg": "The proposal is not the active revision for this invoice."
    },
    {
      "code": 6006,
      "name": "expired",
      "msg": "The proposal has expired."
    },
    {
      "code": 6007,
      "name": "cancelled",
      "msg": "The proposal has been cancelled."
    },
    {
      "code": 6008,
      "name": "alreadyExecuted",
      "msg": "The proposal has already executed."
    },
    {
      "code": 6009,
      "name": "paused",
      "msg": "Execution is paused."
    },
    {
      "code": 6010,
      "name": "overPerPaymentLimit",
      "msg": "The amount exceeds the per-payment limit."
    },
    {
      "code": 6011,
      "name": "overDailyLimit",
      "msg": "The amount exceeds the remaining daily limit."
    },
    {
      "code": 6012,
      "name": "wrongRecipient",
      "msg": "The recipient token account is not the approved owner's canonical account."
    },
    {
      "code": 6013,
      "name": "wrongMint",
      "msg": "The mint or token program does not match the treasury."
    },
    {
      "code": 6014,
      "name": "insufficientFunds",
      "msg": "Insufficient treasury balance."
    },
    {
      "code": 6015,
      "name": "invoiceAlreadyPaid",
      "msg": "The invoice has already settled."
    },
    {
      "code": 6016,
      "name": "mathOverflow",
      "msg": "An arithmetic overflow occurred."
    },
    {
      "code": 6017,
      "name": "treasuryClosed",
      "msg": "The treasury is closed."
    },
    {
      "code": 6018,
      "name": "notEnoughApprovals",
      "msg": "Not enough approvals."
    },
    {
      "code": 6019,
      "name": "notPaused",
      "msg": "The treasury is not paused."
    }
  ],
  "types": [
    {
      "name": "approvalRevoked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "approver",
            "type": "pubkey"
          },
          {
            "name": "approvals",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "dailySpend",
      "docs": [
        "A per-day spending counter. `day` is the fixed UTC day index; a new day",
        "resets the counter."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "day",
            "type": "i64"
          },
          {
            "name": "spent",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "emergencyExitExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "recovery",
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
      "name": "governanceKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "policyChange"
          },
          {
            "name": "unpause"
          },
          {
            "name": "emergencyExit"
          }
        ]
      }
    },
    {
      "name": "governanceProposal",
      "docs": [
        "A governance action: a policy change, an unpause, or an emergency exit."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "policyVersion",
            "type": "u64"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "governanceKind"
              }
            }
          },
          {
            "name": "proposedAt",
            "type": "i64"
          },
          {
            "name": "approvals",
            "type": "u16"
          },
          {
            "name": "executed",
            "type": "bool"
          },
          {
            "name": "cancelled",
            "type": "bool"
          },
          {
            "name": "newThreshold",
            "docs": [
              "New policy fields, used when `kind` is a policy change."
            ],
            "type": "u8"
          },
          {
            "name": "newApproverCount",
            "type": "u8"
          },
          {
            "name": "newApprovers",
            "type": {
              "array": [
                "pubkey",
                10
              ]
            }
          },
          {
            "name": "newPerPaymentLimit",
            "type": "u64"
          },
          {
            "name": "newDailyLimit",
            "type": "u64"
          },
          {
            "name": "newRecovery",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "invoiceKey",
      "docs": [
        "Stable identity for an invoice. The backend enforces normalized supplier +",
        "reference uniqueness; the chain only guarantees one settlement per key."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "array": [
              "u8",
              32
            ]
          }
        ]
      }
    },
    {
      "name": "invoiceSettlement",
      "docs": [
        "Persistent paid marker for one invoice identity. Created and marked paid",
        "atomically with the transfer, so the same invoice cannot settle twice."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "invoiceKey",
            "type": {
              "defined": {
                "name": "invoiceKey"
              }
            }
          },
          {
            "name": "activeRevision",
            "type": "u32"
          },
          {
            "name": "paid",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "paymentApproved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "approver",
            "type": "pubkey"
          },
          {
            "name": "approvals",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "paymentCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposal",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "paymentExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "invoiceKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "recipient",
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
      "name": "paymentProposal",
      "docs": [
        "A payment proposal. Immutable fields are bound at creation; an edit is a new",
        "revision that invalidates old approvals."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "invoiceKey",
            "type": {
              "defined": {
                "name": "invoiceKey"
              }
            }
          },
          {
            "name": "revision",
            "type": "u32"
          },
          {
            "name": "policyVersion",
            "type": "u64"
          },
          {
            "name": "recipientOwner",
            "docs": [
              "Recipient owner; its canonical token account is validated at execution."
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "grossAmount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "approvals",
            "docs": [
              "Bitmap of approvers who have approved (index into treasury.approvers)."
            ],
            "type": "u16"
          },
          {
            "name": "cancelled",
            "type": "bool"
          },
          {
            "name": "executed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "paymentProposed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "invoiceKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "revision",
            "type": "u32"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "policyChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "policyVersion",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "treasuryConfig",
      "docs": [
        "Fixed policy for one treasury. Changes require a governance proposal under",
        "the current threshold; Token Ledger support has no override."
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
            "name": "entity",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "tokenProgram",
            "type": "pubkey"
          },
          {
            "name": "policyVersion",
            "type": "u64"
          },
          {
            "name": "threshold",
            "docs": [
              "How many distinct approvals are required."
            ],
            "type": "u8"
          },
          {
            "name": "approverCount",
            "type": "u8"
          },
          {
            "name": "proposerCount",
            "type": "u8"
          },
          {
            "name": "approvers",
            "type": {
              "array": [
                "pubkey",
                10
              ]
            }
          },
          {
            "name": "proposers",
            "type": {
              "array": [
                "pubkey",
                10
              ]
            }
          },
          {
            "name": "perPaymentLimit",
            "docs": [
              "Per-payment cap in base units."
            ],
            "type": "u64"
          },
          {
            "name": "dailyLimit",
            "docs": [
              "Fixed UTC-day spending cap in base units."
            ],
            "type": "u64"
          },
          {
            "name": "maxProposalLifetime",
            "docs": [
              "Maximum lifetime of a payment proposal, in seconds."
            ],
            "type": "i64"
          },
          {
            "name": "executionPaused",
            "type": "bool"
          },
          {
            "name": "recovery",
            "docs": [
              "A recovery wallet a quorum may exit to while paused."
            ],
            "type": "pubkey"
          },
          {
            "name": "closed",
            "docs": [
              "Set once an emergency exit has run; no further payments are allowed."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "treasuryCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "entity",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "treasuryFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
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
      "name": "treasuryPaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "actor",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "treasuryUnpaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
