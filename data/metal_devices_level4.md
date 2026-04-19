{
  "machines": [
    {
      "id": "M1",
      "type": "lathe",
      "name_ru": "Токарный-1"
    },
    {
      "id": "M2",
      "type": "lathe",
      "name_ru": "Токарный-2"
    },
    {
      "id": "M3",
      "type": "cnc_mill",
      "name_ru": "ФрезерЧПУ-1"
    },
    {
      "id": "M4",
      "type": "cnc_mill",
      "name_ru": "ФрезерЧПУ-2"
    },
    {
      "id": "M5",
      "type": "plasma",
      "name_ru": "Плазморез"
    },
    {
      "id": "M6",
      "type": "weld",
      "name_ru": "Сварочный"
    },
    {
      "id": "M7",
      "type": "paint",
      "name_ru": "Покраска"
    },
    {
      "id": "M8",
      "type": "qc",
      "name_ru": "ОТК"
    },
    {
      "id": "M9",
      "type": "pack",
      "name_ru": "Упаковка"
    }
  ],
  "products": {
    "shaft": [
      {
        "machine_type": "lathe",
        "duration_min": 30,
        "consumes": {
          "iron_blank": 4,
          "coil_roll": 1
        },
        "produces": {
          "turned_core": 1
        }
      },
      {
        "machine_type": "cnc_mill",
        "duration_min": 25,
        "consumes": {
          "turned_core": 1,
          "coolant_pack": 1
        },
        "produces": {
          "milled_core": 1
        }
      },
      {
        "machine_type": "qc",
        "duration_min": 12,
        "consumes": {
          "milled_core": 1,
          "qc_gauge_set": 1
        },
        "produces": {
          "approved_core": 1
        }
      },
      {
        "machine_type": "pack",
        "duration_min": 7,
        "consumes": {
          "approved_core": 1,
          "box_small": 1
        },
        "produces": {
          "shaft": 1
        }
      }
    ],
    "sheet_frame": [
      {
        "machine_type": "plasma",
        "duration_min": 18,
        "consumes": {
          "steel_sheet": 6,
          "plasma_gas": 1
        },
        "produces": {
          "cut_frame_parts": 1
        }
      },
      {
        "machine_type": "weld",
        "duration_min": 25,
        "consumes": {
          "cut_frame_parts": 1,
          "welding_wire": 2
        },
        "produces": {
          "welded_frame": 1
        }
      },
      {
        "machine_type": "cnc_mill",
        "duration_min": 30,
        "consumes": {
          "welded_frame": 1,
          "fixture_set": 1
        },
        "produces": {
          "machined_frame": 1
        }
      },
      {
        "machine_type": "paint",
        "duration_min": 50,
        "consumes": {
          "machined_frame": 1,
          "paint_powder": 2
        },
        "produces": {
          "painted_frame": 1
        }
      },
      {
        "machine_type": "qc",
        "duration_min": 12,
        "consumes": {
          "painted_frame": 1,
          "qc_gauge_set": 1
        },
        "produces": {
          "approved_frame": 1
        }
      },
      {
        "machine_type": "pack",
        "duration_min": 8,
        "consumes": {
          "approved_frame": 1,
          "box_large": 1
        },
        "produces": {
          "sheet_frame": 1
        }
      }
    ],
    "assembly_unit": [
      {
        "machine_type": "lathe",
        "duration_min": 20,
        "consumes": {
          "alloy_blank": 3,
          "brass_bushing": 2
        },
        "produces": {
          "turned_module": 1
        }
      },
      {
        "machine_type": "cnc_mill",
        "duration_min": 35,
        "consumes": {
          "turned_module": 1,
          "coolant_pack": 1
        },
        "produces": {
          "milled_module": 1
        }
      },
      {
        "machine_type": "weld",
        "duration_min": 20,
        "consumes": {
          "milled_module": 1,
          "welding_wire": 1
        },
        "produces": {
          "welded_module": 1
        }
      },
      {
        "machine_type": "paint",
        "duration_min": 45,
        "consumes": {
          "welded_module": 1,
          "paint_powder": 1
        },
        "produces": {
          "painted_module": 1
        }
      },
      {
        "machine_type": "qc",
        "duration_min": 12,
        "consumes": {
          "painted_module": 1,
          "qc_gauge_set": 1
        },
        "produces": {
          "approved_module": 1
        }
      },
      {
        "machine_type": "pack",
        "duration_min": 8,
        "consumes": {
          "approved_module": 1,
          "box_medium": 1
        },
        "produces": {
          "assembly_unit": 1
        }
      }
    ],
    "bracket": [
      {
        "machine_type": "plasma",
        "duration_min": 12,
        "consumes": {
          "steel_sheet": 2,
          "plasma_gas": 1
        },
        "produces": {
          "cut_bracket": 1
        }
      },
      {
        "machine_type": "weld",
        "duration_min": 18,
        "consumes": {
          "cut_bracket": 1,
          "welding_wire": 1
        },
        "produces": {
          "welded_bracket": 1
        }
      },
      {
        "machine_type": "paint",
        "duration_min": 45,
        "consumes": {
          "welded_bracket": 1,
          "paint_powder": 1
        },
        "produces": {
          "painted_bracket": 1
        }
      },
      {
        "machine_type": "qc",
        "duration_min": 10,
        "consumes": {
          "painted_bracket": 1,
          "qc_gauge_set": 1
        },
        "produces": {
          "approved_bracket": 1
        }
      },
      {
        "machine_type": "pack",
        "duration_min": 6,
        "consumes": {
          "approved_bracket": 1,
          "box_small": 1
        },
        "produces": {
          "bracket": 1
        }
      }
    ]
  },
  "orders": [
    {
      "id": "ORD-001",
      "product": "shaft",
      "deadline_min": 120,
      "priority": 1,
      "qty": 10
    },
    {
      "id": "ORD-002",
      "product": "sheet_frame",
      "deadline_min": 250,
      "priority": 2,
      "qty": 10
    },
    {
      "id": "ORD-003",
      "product": "shaft",
      "deadline_min": 150,
      "priority": 1,
      "qty": 10
    },
    {
      "id": "ORD-004",
      "product": "assembly_unit",
      "deadline_min": 300,
      "priority": 2,
      "qty": 10
    },
    {
      "id": "ORD-005",
      "product": "bracket",
      "deadline_min": 200,
      "priority": 2,
      "qty": 100
    },
    {
      "id": "ORD-006",
      "product": "sheet_frame",
      "deadline_min": 320,
      "priority": 3,
      "qty": 10
    },
    {
      "id": "ORD-007",
      "product": "shaft",
      "deadline_min": 180,
      "priority": 2,
      "qty": 20
    },
    {
      "id": "ORD-008",
      "product": "assembly_unit",
      "deadline_min": 380,
      "priority": 1,
      "qty": 20
    },
    {
      "id": "ORD-009",
      "product": "bracket",
      "deadline_min": 270,
      "priority": 3,
      "qty": 20
    },
    {
      "id": "ORD-010",
      "product": "sheet_frame",
      "deadline_min": 420,
      "priority": 2,
      "qty": 20
    }
  ]
}