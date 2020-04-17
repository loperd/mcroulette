function _img(s: string): string
{
    return "/static/icon/" + s
}

export default {
    items: [
        {
            id: 1,
            title: "Vip",
            image: _img("7de3bb62825c11f969be67b4720a6fb5eaba9d69.png"),
            type: "default",
        },
        {
            id: 2,
            title: "Premium",
            image: _img("33ae616445a689c5fd84b057e8f4441950d37362.png"),
            type: "default",
        },
        {
            id: 3,
            title: "Creative",
            image: _img("bf5d1e948aa947b5f3a4580c6a94a06480e35b2a.png"),
            type: "default",
        },
        {
            id: 4,
            title: "Admin",
            image: _img("5c0a4fc7c32f26dec6ff80e80471b4a93152d252.png"),
            type: "default",
        },
        {
            id: 5,
            title: "Lord",
            image: _img("591694466c988d2530ca324a7590df69f20402bd.png"),
            type: "default",
        },
        {
            id: 6,
            title: "Enigma",
            image: _img("d35a130b49a6bb29248ee21144ce68779bcd91f4.png"),
            type: "default",
        },
        {
            id: 7,
            title: "Deluxe",
            image: _img("7505d64a54e061b7acd54ccd58b49dc43500b635.png"),
            type: "default",
        },
        {
            id: 8,
            title: "Caesar",
            image: _img("eca4d8fb36546ac643bb2a27584b4522034e358a.png"),
            type: "primary",
        },
        {
            id: 9,
            title: "Baron",
            image: _img("672410c017e7b495ddcaab02fa638e1c80443fdd.png"),
            type: "primary",
        },
        {
            id: 10,
            title: "Hero",
            image: _img("9c255818396a81ebc9b3ba6a85af9edd13116e72.png"),
            type: "primary",
        },
        {
            id: 11,
            title: "Sentinel",
            image: _img("da39a3ee5e6b4b0d3255bfef95601890afd80709.jpg"),
            type: "primary",
        },
        {
            id: 12,
            title: "Emperor",
            image: _img("754d2e97bafe87cf79fea733afb2a09bab2db7e3.png"),
            type: "primary",
        },
        {
            id: 13,
            title: "Ruler",
            image: _img("99160cc08d029f4ba966d6d95aee97323f8483ee.png"),
            type: "legendary",
        },
        {
            id: 14,
            title: "King",
            image: _img("23f58b59e0d2291da1bf4a9ddea3255e3c643924.png"),
            type: "legendary",
        },
    ]
}