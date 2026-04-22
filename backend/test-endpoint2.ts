import { createDocument } from "./src/controllers/docController";
import 'dotenv/config';

(async () => {
    const req = {
        auth: { userId: "user_3CUlylzgQ5Zwld4t7jdRJCArc8C" },
        body: {
            title: "My Doc Testing Endpoint",
            collaborators: [{ email: "shivam.bgp@outlook.com", role: "editor" }],
            folder_id: null
        }
    };
    const res = {
        status: (code: number) => {
            console.log("STATUS:", code);
            return res;
        },
        json: (data: any) => {
            console.log("JSON:", JSON.stringify(data, null, 2));
        }
    };
    await createDocument(req as any, res as any);
})();
